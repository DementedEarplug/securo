"""Refresh-token exchange and per-device session management.

Kept apart from `custom_auth` because that router inherits the 5/min login
rate limit, which a client refreshing in the background would trip.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user, get_jwt_strategy
from app.core.database import get_async_session
from app.core.rate_limit import refresh_rate_limit
from app.models.user import User
from app.schemas.auth import RefreshRequest, SessionRead, TokenResponse
from app.services import refresh_token_service

router = APIRouter()


@router.post(
    "/refresh",
    response_model=TokenResponse,
    dependencies=[Depends(refresh_rate_limit)],
)
async def refresh(
    body: RefreshRequest,
    request: Request,
    session: AsyncSession = Depends(get_async_session),
):
    try:
        user, plain, row = await refresh_token_service.rotate(
            session, body.refresh_token, request=request
        )
    except refresh_token_service.RefreshTokenInvalid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    access_token = await get_jwt_strategy().write_token(user)
    return TokenResponse(
        access_token=access_token,
        refresh_token=plain,
        refresh_token_expires_at=row.expires_at,
    )


@router.get("/sessions", response_model=list[SessionRead])
async def list_sessions(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    return await refresh_token_service.list_active(session, user.id)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    session_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    if not await refresh_token_service.revoke_by_id(session, user.id, session_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
