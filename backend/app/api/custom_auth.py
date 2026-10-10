import secrets
import json

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_user_manager
from app.core.auth_policy import require_local_auth_enabled
from app.core.database import get_async_session
from app.core.redis import get_redis
from app.models.passkey import UserPasskey
from app.schemas.auth import LogoutRequest, TokenResponse, TwoFactorChallengeResponse
from app.services import refresh_token_service

router = APIRouter()

TEMP_TOKEN_TTL = 300  # 5 minutes


@router.post(
    "/login",
    response_model=TokenResponse | TwoFactorChallengeResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_local_auth_enabled)],
)
async def login(
    request: Request,
    credentials: OAuth2PasswordRequestForm = Depends(),
    remember: bool = Query(False, description="Also issue a refresh token (native clients)."),
    user_manager=Depends(get_user_manager),
    session: AsyncSession = Depends(get_async_session),
):
    user = await user_manager.authenticate(credentials)
    if user is None or not user.is_active:
        raise HTTPException(status_code=400, detail="LOGIN_BAD_CREDENTIALS")

    available_methods = []
    if user.is_2fa_enabled and user.totp_secret:
        available_methods.append("totp")
        # A passkey doubles as a second factor only when the user explicitly
        # enabled 2FA. On its own it is a passwordless login alternative —
        # requiring it on top of the password would permanently lock the
        # account if the passkey is lost (there are no recovery codes).
        passkey_count = await session.scalar(
            select(func.count()).select_from(UserPasskey).where(UserPasskey.user_id == user.id)
        )
        if passkey_count and passkey_count > 0:
            available_methods.append("passkey")

    if available_methods:
        # Store temp token in Redis, return 2FA challenge
        r = await get_redis()
        temp_token = secrets.token_urlsafe(32)
        await r.set(
            f"2fa_temp:{temp_token}",
            json.dumps({"user_id": str(user.id), "available_methods": available_methods}),
            ex=TEMP_TOKEN_TTL,
        )
        return TwoFactorChallengeResponse(temp_token=temp_token, available_methods=available_methods)

    # Normal login — generate JWT
    return await refresh_token_service.build_token_response(
        session, user, remember=remember, request=request
    )


@router.post("/logout")
async def logout(
    body: LogoutRequest | None = Body(None),
    session: AsyncSession = Depends(get_async_session),
):
    # Access tokens are stateless and simply expire; a client that holds a
    # refresh token sends it so this device cannot mint new ones.
    if body is not None and body.refresh_token:
        await refresh_token_service.revoke(session, body.refresh_token)
    return {"detail": "Logged out"}
