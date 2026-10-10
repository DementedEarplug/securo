"""Issue, rotate and revoke refresh tokens for long-lived client sessions."""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Request
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_jwt_strategy
from app.core.config import get_settings
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import TokenResponse

DEVICE_NAME_HEADER = "x-device-name"


class RefreshTokenInvalid(Exception):
    """The presented refresh token is unknown, expired, revoked or reused."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime) -> datetime:
    # SQLite (tests) hands back naive datetimes for timezone-aware columns.
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _client_details(request: Request | None) -> tuple[str | None, str | None]:
    if request is None:
        return None, None
    device_name = (request.headers.get(DEVICE_NAME_HEADER) or "").strip()[:100] or None
    user_agent = (request.headers.get("user-agent") or "").strip()[:255] or None
    return device_name, user_agent


async def issue(
    session: AsyncSession,
    user: User,
    *,
    request: Request | None = None,
    family_id: uuid.UUID | None = None,
) -> tuple[str, RefreshToken]:
    """Create a refresh token for `user`. Returns the plain token and its row."""
    plain = secrets.token_urlsafe(48)
    device_name, user_agent = _client_details(request)
    row = RefreshToken(
        id=uuid.uuid4(),
        user_id=user.id,
        token_hash=hash_token(plain),
        family_id=family_id or uuid.uuid4(),
        created_at=_now(),
        expires_at=_now() + timedelta(days=get_settings().refresh_token_expire_days),
        device_name=device_name,
        user_agent=user_agent,
    )
    session.add(row)
    await session.flush()
    return plain, row


async def _revoke_family(session: AsyncSession, family_id: uuid.UUID) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )


async def rotate(
    session: AsyncSession, plain: str, *, request: Request | None = None
) -> tuple[User, str, RefreshToken]:
    """Exchange a refresh token for a new one in the same family.

    Raises RefreshTokenInvalid when the token cannot be used. Presenting a
    token that was already rotated revokes the whole family, because only a
    copy of an old token can produce that.
    """
    result = await session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(plain)).with_for_update()
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise RefreshTokenInvalid

    if row.revoked_at is not None:
        if row.replaced_by_id is not None:
            await _revoke_family(session, row.family_id)
            await session.commit()
        raise RefreshTokenInvalid

    if _aware(row.expires_at) <= _now():
        raise RefreshTokenInvalid

    user = await session.get(User, row.user_id)
    if user is None or not user.is_active:
        raise RefreshTokenInvalid

    new_plain, new_row = await issue(session, user, request=request, family_id=row.family_id)
    # A rotated token keeps the device label it was issued under unless the
    # client sends a new one.
    new_row.device_name = new_row.device_name or row.device_name
    row.revoked_at = _now()
    row.last_used_at = _now()
    row.replaced_by_id = new_row.id
    await session.execute(
        delete(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.expires_at <= _now())
        .execution_options(synchronize_session=False)
    )
    await session.commit()
    return user, new_plain, new_row


async def revoke(session: AsyncSession, plain: str, *, user_id: uuid.UUID | None = None) -> bool:
    """Revoke the family a refresh token belongs to (sign-out of that device)."""
    query = select(RefreshToken).where(RefreshToken.token_hash == hash_token(plain))
    if user_id is not None:
        query = query.where(RefreshToken.user_id == user_id)
    row = (await session.execute(query)).scalar_one_or_none()
    if row is None:
        return False
    await _revoke_family(session, row.family_id)
    await session.commit()
    return True


async def revoke_by_id(session: AsyncSession, user_id: uuid.UUID, token_id: uuid.UUID) -> bool:
    row = await session.get(RefreshToken, token_id)
    if row is None or row.user_id != user_id or row.revoked_at is not None:
        return False
    await _revoke_family(session, row.family_id)
    await session.commit()
    return True


async def revoke_all_for_user(session: AsyncSession, user_id: uuid.UUID) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )
    await session.commit()


async def list_active(session: AsyncSession, user_id: uuid.UUID) -> list[RefreshToken]:
    """The current (unrevoked, unexpired) token of each signed-in device."""
    result = await session.execute(
        select(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > _now(),
        )
        .order_by(RefreshToken.created_at.desc())
    )
    return list(result.scalars().all())


async def build_token_response(
    session: AsyncSession,
    user: User,
    *,
    remember: bool,
    request: Request | None = None,
) -> TokenResponse:
    """The response of every sign-in endpoint: an access token, plus a refresh
    token when the client asked to stay signed in."""
    access_token = await get_jwt_strategy().write_token(user)
    if not remember:
        return TokenResponse(access_token=access_token)
    plain, row = await issue(session, user, request=request)
    await session.commit()
    return TokenResponse(
        access_token=access_token,
        refresh_token=plain,
        refresh_token_expires_at=row.expires_at,
    )
