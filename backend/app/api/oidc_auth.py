import base64
import hashlib
import hmac
import json
import re
import secrets
import uuid
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from fastapi_users import schemas
from fastapi_users.exceptions import UserAlreadyExists
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import UserManager, get_jwt_strategy, get_user_manager
from app.core.config import get_settings
from app.core.database import get_async_session
from app.core.rate_limit import login_rate_limit
from app.core.redis import get_redis
from app.models.account import Account
from app.models.user import User
from app.models.workspace import WORKSPACE_ROLES, Workspace, WorkspaceMember
from app.schemas.auth import TokenResponse
from app.services import admin_service
from app.services.category_service import create_default_categories
from app.services.refresh_token_service import build_token_response
from app.services.rule_service import create_default_rules
from app.services.workspace_service import create_personal_workspace_for_user

router = APIRouter(prefix="/api/auth/oidc", tags=["auth"])
OIDC_STATE_TTL = 600
# A native app's one-time code only has to survive the hop from the browser
# back into the app, which takes a second or two.
OIDC_APP_CODE_TTL = 60
# RFC 7636: S256 challenges are 43 base64url characters; verifiers are 43-128
# characters of the unreserved set.
_CODE_CHALLENGE_RE = re.compile(r"^[A-Za-z0-9_-]{43}$")
_CODE_VERIFIER_RE = re.compile(r"^[A-Za-z0-9._~-]{43,128}$")


class OIDCConfigResponse(BaseModel):
    enabled: bool
    provider_name: str = "OIDC"
    local_auth_enabled: bool = True
    # Redirect URIs native apps may use with `app_redirect`; empty when the
    # native flow is off.
    native_redirect_uris: list[str] = []


class OIDCExchangeRequest(BaseModel):
    code: str
    code_verifier: str


def _s256(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()


def _app_code_key(code: str) -> str:
    # Stored hashed, like refresh tokens: a Redis dump doesn't hand out logins.
    return f"oidc_app_code:{hashlib.sha256(code.encode()).hexdigest()}"


def _with_query(uri: str, params: dict[str, str]) -> str:
    return f"{uri}{'&' if '?' in uri else '?'}{urlencode(params)}"


async def _discover() -> dict[str, Any]:
    settings = get_settings()
    if not settings.oidc_enabled:
        raise HTTPException(status_code=404, detail="OIDC login is not enabled")
    if not settings.oidc_discovery_url:
        raise HTTPException(status_code=500, detail="OIDC_DISCOVERY_URL is required")
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(settings.oidc_discovery_url)
        response.raise_for_status()
        return response.json()


def _redirect_uri() -> str:
    settings = get_settings()
    return settings.oidc_redirect_uri or f"{settings.frontend_url.rstrip('/')}/api/auth/oidc/callback"


@router.get("/config", response_model=OIDCConfigResponse)
async def oidc_config():
    settings = get_settings()
    return OIDCConfigResponse(
        enabled=settings.oidc_login_available,
        provider_name=settings.oidc_provider_name or "OIDC",
        local_auth_enabled=settings.local_auth_enabled,
        native_redirect_uris=settings.oidc_native_redirect_uri_list if settings.oidc_login_available else [],
    )


@router.get("/login")
async def oidc_login(
    app_redirect: str | None = Query(
        None, description="Native apps: where to return with a one-time code (must be allow-listed)"
    ),
    app_code_challenge: str | None = Query(None, description="Native apps: PKCE S256 challenge"),
    app_code_challenge_method: str = Query("S256"),
):
    settings = get_settings()
    if app_redirect is not None or app_code_challenge is not None:
        # Exact match only: a prefix or pattern would let a look-alike URI
        # receive the code. The PKCE challenge binds the code to the app.
        if app_redirect is None or app_redirect not in settings.oidc_native_redirect_uri_list:
            raise HTTPException(status_code=400, detail="app_redirect is not an allowed redirect URI")
        if app_code_challenge_method != "S256":
            raise HTTPException(status_code=400, detail="Only the S256 code challenge method is supported")
        if app_code_challenge is None or not _CODE_CHALLENGE_RE.fullmatch(app_code_challenge):
            raise HTTPException(status_code=400, detail="app_code_challenge must be an S256 challenge")
    if not settings.oidc_client_id:
        raise HTTPException(status_code=500, detail="OIDC_CLIENT_ID is required")
    discovery = await _discover()
    authorization_endpoint = discovery.get("authorization_endpoint")
    if not authorization_endpoint:
        raise HTTPException(status_code=500, detail="OIDC discovery is missing authorization_endpoint")

    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    code_verifier = secrets.token_urlsafe(64)
    code_challenge = _s256(code_verifier)
    state_data = {"nonce": nonce, "code_verifier": code_verifier}
    if app_redirect is not None:
        state_data["app_redirect"] = app_redirect
        state_data["app_code_challenge"] = app_code_challenge
    r = await get_redis()
    await r.set(f"oidc_state:{state}", json.dumps(state_data), ex=OIDC_STATE_TTL)

    params = {
        "client_id": settings.oidc_client_id,
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": settings.oidc_scopes,
        "state": state,
        "nonce": nonce,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return RedirectResponse(f"{authorization_endpoint}?{urlencode(params)}")


async def _exchange_code(discovery: dict[str, Any], code: str, code_verifier: str) -> dict[str, Any]:
    settings = get_settings()
    token_endpoint = discovery.get("token_endpoint")
    if not token_endpoint:
        raise HTTPException(status_code=500, detail="OIDC discovery is missing token_endpoint")
    data = {
        "grant_type": "authorization_code",
        "client_id": settings.oidc_client_id,
        "client_secret": settings.oidc_client_secret.get_secret_value(),
        "code": code,
        "redirect_uri": _redirect_uri(),
        "code_verifier": code_verifier,
    }
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(token_endpoint, data=data)
        response.raise_for_status()
        return response.json()


async def _fetch_userinfo(discovery: dict[str, Any], access_token: str) -> dict[str, Any]:
    userinfo_endpoint = discovery.get("userinfo_endpoint")
    if not userinfo_endpoint:
        return {}
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(userinfo_endpoint, headers={"Authorization": f"Bearer {access_token}"})
        response.raise_for_status()
        return response.json()


async def _decode_id_token(
    discovery: dict[str, Any], id_token: str, nonce: str, access_token: str = ""
) -> dict[str, Any]:
    settings = get_settings()
    jwks_uri = discovery.get("jwks_uri")
    issuer = discovery.get("issuer")
    if not jwks_uri or not issuer:
        raise HTTPException(status_code=500, detail="OIDC discovery is missing jwks_uri or issuer")
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(jwks_uri)
        response.raise_for_status()
        jwks = response.json()
    headers = jwt.get_unverified_header(id_token)
    key = next((k for k in jwks.get("keys", []) if k.get("kid") == headers.get("kid")), None)
    if key is None:
        raise HTTPException(status_code=400, detail="OIDC signing key not found")
    try:
        claims = jwt.decode(
            id_token,
            key,
            algorithms=[key.get("alg", "RS256")],
            audience=settings.oidc_client_id,
            issuer=issuer,
            access_token=access_token,
        )
    except JWTError as exc:
        raise HTTPException(status_code=400, detail="Invalid OIDC id_token") from exc
    if claims.get("nonce") != nonce:
        raise HTTPException(status_code=400, detail="Invalid OIDC nonce")
    return claims


def _claim_values(payload: dict[str, Any], claim_name: str) -> set[str]:
    value: Any = payload
    for part in claim_name.split("."):
        if isinstance(value, dict):
            value = value.get(part)
        else:
            return set()
    if value is None:
        return set()
    if isinstance(value, str):
        return {value}
    if isinstance(value, (list, tuple, set)):
        return {str(item) for item in value}
    return {str(value)}


def _parse_workspace_role_map(raw: str) -> dict[str, str]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="OIDC_WORKSPACE_ROLE_MAP must be valid JSON") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=500, detail="OIDC_WORKSPACE_ROLE_MAP must be a JSON object")
    role_map = {str(k): str(v).lower() for k, v in parsed.items()}
    invalid = sorted({role for role in role_map.values() if role not in WORKSPACE_ROLES})
    if invalid:
        raise HTTPException(
            status_code=500,
            detail=f"OIDC_WORKSPACE_ROLE_MAP contains invalid Securo roles: {', '.join(invalid)}",
        )
    return role_map


def _desired_workspace_role(provider_roles: set[str], role_map: dict[str, str]) -> str | None:
    role_rank = {"viewer": 1, "editor": 2, "owner": 3}
    matches = [role_map[role] for role in provider_roles if role in role_map]
    if not matches:
        return None
    return max(matches, key=lambda role: role_rank[role])


OIDC_EXISTING_USER_LINK_MODES = {"disabled", "verified_email", "email"}


async def _sync_oidc_roles(user: User, merged_claims: dict[str, Any], session: AsyncSession) -> None:
    settings = get_settings()
    if not settings.oidc_sync_roles:
        return
    provider_roles = _claim_values(merged_claims, settings.oidc_roles_claim)
    admin_roles = {role.strip() for role in settings.oidc_admin_roles.split(",") if role.strip()}
    if admin_roles:
        user.is_superuser = bool(provider_roles & admin_roles)
        session.add(user)

    role_map = _parse_workspace_role_map(settings.oidc_workspace_role_map)
    desired_role = _desired_workspace_role(provider_roles, role_map)
    if desired_role is None:
        return

    workspace_result = await session.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(
            WorkspaceMember.user_id == user.id,
            Workspace.kind == "personal",
            Workspace.created_by_user_id == user.id,
        )
        .limit(1)
    )
    workspace = workspace_result.scalar_one_or_none()
    if workspace is None:
        return
    member_result = await session.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace.id,
            WorkspaceMember.user_id == user.id,
        )
    )
    member = member_result.scalar_one_or_none()
    if member is not None and member.role != desired_role:
        if workspace.kind == "personal" and member.role == "owner" and desired_role != "owner":
            return
        member.role = desired_role
        session.add(member)


async def _get_or_create_oidc_user(
    claims: dict[str, Any],
    userinfo: dict[str, Any],
    issuer: str,
    session: AsyncSession,
    user_manager: UserManager,
) -> User:
    settings = get_settings()
    if userinfo.get("sub") is not None and userinfo.get("sub") != claims.get("sub"):
        raise HTTPException(status_code=400, detail="OIDC userinfo subject does not match id_token subject")
    # Userinfo is fetched with a bearer token, but the id_token is the signed,
    # audience-validated source of truth. Let signed claims win for overlapping
    # identity and authorization fields such as email, email_verified, and groups.
    merged = {**userinfo, **claims}
    subject = merged.get("sub")
    if not subject:
        raise HTTPException(status_code=400, detail="OIDC provider did not return a subject claim")
    subject = str(subject)
    if not issuer:
        raise HTTPException(status_code=500, detail="OIDC discovery is missing issuer")

    link_mode = settings.oidc_existing_user_link_mode
    if link_mode not in OIDC_EXISTING_USER_LINK_MODES:
        raise HTTPException(status_code=500, detail="OIDC_EXISTING_USER_LINK_MODE must be disabled, verified_email, or email")

    linked = await session.execute(select(User).where(User.oidc_issuer == issuer, User.oidc_subject == subject))
    user = linked.scalar_one_or_none()
    if user is not None:
        await _sync_oidc_roles(user, merged, session)
        await session.commit()
        await session.refresh(user)
        return user

    email = merged.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="OIDC provider did not return an email claim")
    email = str(EmailStr._validate(email)).lower()
    email_verified = merged.get("email_verified")

    existing = await session.execute(select(User).where(func.lower(User.email) == email))
    user = existing.scalar_one_or_none()
    if user is not None:
        if user.oidc_issuer or user.oidc_subject:
            raise HTTPException(status_code=403, detail="OIDC identity is linked to a different account")
        if link_mode == "disabled":
            raise HTTPException(status_code=403, detail="Existing account is not linked to this OIDC identity")
        if link_mode == "verified_email" and email_verified not in (True, "true"):
            raise HTTPException(status_code=400, detail="OIDC email is not verified")
        user.oidc_issuer = issuer
        user.oidc_subject = subject
        session.add(user)
        await _sync_oidc_roles(user, merged, session)
        await session.commit()
        await session.refresh(user)
        return user
    if settings.oidc_require_verified_email and email_verified not in (True, "true"):
        raise HTTPException(status_code=400, detail="OIDC email is not verified")
    if not await admin_service.is_registration_enabled(session):
        raise HTTPException(status_code=403, detail="Registration is disabled")
    if not settings.oidc_auto_register:
        raise HTTPException(status_code=403, detail="No local account is linked to this OIDC identity")

    display_name = merged.get("name") or merged.get("preferred_username") or email.split("@", 1)[0]
    preferences = {
        "language": "en",
        "date_format": "MM/DD/YYYY",
        "timezone": "UTC",
        "currency_display": settings.default_currency,
        "display_name": display_name,
        "auth_provider": settings.oidc_provider_name,
    }
    provider_roles = _claim_values(merged, settings.oidc_roles_claim)
    admin_roles = {role.strip() for role in settings.oidc_admin_roles.split(",") if role.strip()}
    user_create = schemas.BaseUserCreate(
        email=email,
        password=secrets.token_urlsafe(32),
        is_verified=True,
        is_superuser=bool(settings.oidc_sync_roles and admin_roles and provider_roles & admin_roles),
    )
    try:
        user = await user_manager.create(user_create, safe=True, request=None)
    except UserAlreadyExists:
        user = (await session.execute(select(User).where(func.lower(User.email) == email))).scalar_one()

    db_session = user_manager.user_db.session
    await db_session.execute(
        sql_update(User)
        .where(User.id == user.id)
        .values(preferences=preferences, oidc_issuer=issuer, oidc_subject=str(merged.get("sub")))
    )
    await db_session.refresh(user)
    workspace = await create_personal_workspace_for_user(db_session, user)
    wallet = Account(
        user_id=user.id,
        workspace_id=workspace.id,
        name="Wallet",
        type="checking",
        balance=0,
        currency=settings.default_currency,
    )
    db_session.add(wallet)
    await db_session.commit()
    await create_default_categories(db_session, user.id, "en", workspace_id=workspace.id)
    await create_default_rules(db_session, user.id, "en", workspace_id=workspace.id)
    await _sync_oidc_roles(user, merged, db_session)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _authenticate_callback(
    code: str, state_data: dict[str, Any], session: AsyncSession, user_manager: UserManager
) -> User:
    discovery = await _discover()
    token_response = await _exchange_code(discovery, code, state_data.get("code_verifier", ""))
    id_token = token_response.get("id_token")
    if not id_token:
        raise HTTPException(status_code=400, detail="OIDC provider did not return an id_token")
    claims = await _decode_id_token(
        discovery, id_token, state_data["nonce"], token_response.get("access_token", "")
    )
    userinfo = await _fetch_userinfo(discovery, token_response.get("access_token", ""))
    user = await _get_or_create_oidc_user(claims, userinfo, discovery.get("issuer", ""), session, user_manager)
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is inactive")
    return user


async def _native_callback(
    code: str | None,
    error: str | None,
    state_data: dict[str, Any],
    session: AsyncSession,
    user_manager: UserManager,
) -> RedirectResponse:
    """Finish a native app's sign-in: hand it a one-time code, never a token.

    The browser lands on the app's redirect URI, which another app could also
    claim; the code is useless without the verifier only the real app holds.
    """
    app_redirect = state_data["app_redirect"]
    # The allow-list is checked again: it may have changed since /login.
    if app_redirect not in get_settings().oidc_native_redirect_uri_list:
        raise HTTPException(status_code=400, detail="app_redirect is not an allowed redirect URI")
    if code is None:
        return RedirectResponse(_with_query(app_redirect, {"error": error or "access_denied"}))
    try:
        user = await _authenticate_callback(code, state_data, session, user_manager)
    except HTTPException as exc:
        if exc.status_code >= 500:
            raise
        return RedirectResponse(
            _with_query(app_redirect, {"error": "access_denied", "error_description": str(exc.detail)})
        )
    except httpx.HTTPError:
        return RedirectResponse(_with_query(app_redirect, {"error": "server_error"}))

    app_code = secrets.token_urlsafe(32)
    r = await get_redis()
    await r.set(
        _app_code_key(app_code),
        json.dumps({"user_id": str(user.id), "code_challenge": state_data["app_code_challenge"]}),
        ex=OIDC_APP_CODE_TTL,
    )
    return RedirectResponse(_with_query(app_redirect, {"code": app_code}))


@router.get("/callback")
async def oidc_callback(
    state: str = Query(...),
    code: str | None = Query(None),
    error: str | None = Query(None),
    session: AsyncSession = Depends(get_async_session),
    user_manager: UserManager = Depends(get_user_manager),
):
    r = await get_redis()
    state_key = f"oidc_state:{state}"
    raw_state = await r.get(state_key)
    if raw_state is None:
        raise HTTPException(status_code=400, detail="Invalid or expired OIDC state")
    if isinstance(raw_state, bytes):
        raw_state = raw_state.decode()
    state_data = json.loads(raw_state)

    if state_data.get("app_redirect"):
        await r.delete(state_key)
        return await _native_callback(code, error, state_data, session, user_manager)

    if code is None:
        # The web flow has always required `code` here; keep its answer.
        raise HTTPException(status_code=422, detail="Missing OIDC authorization code")
    await r.delete(state_key)

    user = await _authenticate_callback(code, state_data, session, user_manager)
    token = await get_jwt_strategy().write_token(user)
    frontend_url = get_settings().frontend_url.rstrip("/")
    return RedirectResponse(f"{frontend_url}/auth/oidc/callback#access_token={token}&token_type=bearer")


@router.post("/exchange", response_model=TokenResponse, dependencies=[Depends(login_rate_limit)])
async def oidc_exchange(
    body: OIDCExchangeRequest,
    request: Request,
    session: AsyncSession = Depends(get_async_session),
):
    """Trade a native app's one-time code and PKCE verifier for a session.

    The code is consumed before the verifier is checked, so a wrong guess
    burns it: each code allows exactly one attempt.
    """
    settings = get_settings()
    if not settings.oidc_login_available or not settings.oidc_native_redirect_uri_list:
        raise HTTPException(status_code=404, detail="OIDC sign-in for apps is not enabled")
    if not _CODE_VERIFIER_RE.fullmatch(body.code_verifier):
        raise HTTPException(status_code=400, detail="Invalid code_verifier")

    r = await get_redis()
    raw = await r.getdel(_app_code_key(body.code))
    if raw is None:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    if isinstance(raw, bytes):
        raw = raw.decode()
    data = json.loads(raw)
    if not hmac.compare_digest(_s256(body.code_verifier), data["code_challenge"]):
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    user = await session.get(User, uuid.UUID(data["user_id"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    return await build_token_response(session, user, remember=True, request=request)
