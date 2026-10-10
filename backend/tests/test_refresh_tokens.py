from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pyotp
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_jwt_strategy
from app.core.config import get_settings
from app.core.rate_limit import login_rate_limit, refresh_rate_limit
from app.main import app
from app.models.refresh_token import RefreshToken
from app.services.refresh_token_service import hash_token

FORM = {"Content-Type": "application/x-www-form-urlencoded"}
CREDENTIALS = {"username": "test@example.com", "password": "testpass123"}


def _redis_with_store():
    store = {}
    mock = AsyncMock()
    mock.get = AsyncMock(side_effect=lambda key: store.get(key))

    async def _set(key, value, ex=None):
        store[key] = value

    mock.set = AsyncMock(side_effect=_set)
    mock.delete = AsyncMock(side_effect=lambda key: store.pop(key, None))
    pipe = MagicMock()
    pipe.execute = AsyncMock(return_value=[0, 0, True, True])
    mock.pipeline = lambda: pipe
    return mock


@pytest.fixture(autouse=True)
def _redis(_mock_redis):
    mock = _redis_with_store()

    async def _fake():
        return mock

    with patch("app.core.redis.get_redis", _fake), \
         patch("app.core.rate_limit.get_redis", _fake), \
         patch("app.api.custom_auth.get_redis", _fake), \
         patch("app.api.two_factor.get_redis", _fake):
        yield mock


async def _login(client: AsyncClient, *, remember: bool = True, headers: dict | None = None):
    response = await client.post(
        "/api/auth/login" + ("?remember=true" if remember else ""),
        data=CREDENTIALS,
        headers={**FORM, **(headers or {})},
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _refresh(client: AsyncClient, token: str):
    return await client.post("/api/auth/refresh", json={"refresh_token": token})


async def test_login_without_remember_keeps_the_web_payload(client: AsyncClient, test_user):
    data = await _login(client, remember=False)

    assert set(data) == {"access_token", "token_type"}


async def test_login_with_remember_returns_refresh_token(
    client: AsyncClient, test_user, session: AsyncSession
):
    data = await _login(client, headers={"X-Device-Name": "Pixel 9", "User-Agent": "okhttp/5"})

    assert data["access_token"]
    assert data["refresh_token"]
    assert data["refresh_token_expires_at"]
    row = (await session.execute(select(RefreshToken))).scalar_one()
    # Only the hash is stored.
    assert row.token_hash == hash_token(data["refresh_token"])
    assert row.token_hash != data["refresh_token"]
    assert row.device_name == "Pixel 9"
    assert row.user_agent == "okhttp/5"


async def test_refresh_returns_a_working_access_token(client: AsyncClient, test_user):
    tokens = await _login(client)

    response = await _refresh(client, tokens["refresh_token"])

    assert response.status_code == 200
    new = response.json()
    me = await client.get("/api/users/me", headers={"Authorization": f"Bearer {new['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "test@example.com"


async def test_refresh_rotates_and_rejects_the_old_token(client: AsyncClient, test_user):
    tokens = await _login(client)

    first = await _refresh(client, tokens["refresh_token"])
    assert first.status_code == 200
    rotated = first.json()["refresh_token"]
    assert rotated != tokens["refresh_token"]

    second = await _refresh(client, rotated)
    assert second.status_code == 200


async def test_reusing_a_rotated_token_revokes_the_family(client: AsyncClient, test_user):
    tokens = await _login(client)
    rotated = (await _refresh(client, tokens["refresh_token"])).json()["refresh_token"]

    # The original token was already exchanged: only a stolen copy presents it.
    replay = await _refresh(client, tokens["refresh_token"])
    assert replay.status_code == 401

    # The legitimate holder of the newest token is signed out too.
    assert (await _refresh(client, rotated)).status_code == 401


async def test_reuse_does_not_touch_other_devices(client: AsyncClient, test_user):
    phone = await _login(client)
    tablet = await _login(client)
    await _refresh(client, phone["refresh_token"])

    await _refresh(client, phone["refresh_token"])  # replay on the phone family

    assert (await _refresh(client, tablet["refresh_token"])).status_code == 200


async def test_unknown_refresh_token_is_rejected(client: AsyncClient, test_user):
    response = await _refresh(client, "not-a-real-token")

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid refresh token"


async def test_expired_refresh_token_is_rejected(
    client: AsyncClient, test_user, session: AsyncSession
):
    tokens = await _login(client)
    row = (await session.execute(select(RefreshToken))).scalar_one()
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    await session.commit()

    assert (await _refresh(client, tokens["refresh_token"])).status_code == 401


async def test_refresh_for_deactivated_user_is_rejected(
    client: AsyncClient, test_user, session: AsyncSession
):
    tokens = await _login(client)
    test_user.is_active = False
    session.add(test_user)
    await session.commit()

    assert (await _refresh(client, tokens["refresh_token"])).status_code == 401


async def test_refresh_token_lifetime_follows_settings(client: AsyncClient, test_user):
    settings = get_settings()
    previous = settings.refresh_token_expire_days
    settings.refresh_token_expire_days = 7
    try:
        data = await _login(client)
    finally:
        settings.refresh_token_expire_days = previous

    expires_at = datetime.fromisoformat(data["refresh_token_expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    remaining = expires_at - datetime.now(timezone.utc)
    assert timedelta(days=6, hours=23) < remaining <= timedelta(days=7)


async def test_logout_with_refresh_token_revokes_it(client: AsyncClient, test_user):
    tokens = await _login(client)

    response = await client.post("/api/auth/logout", json={"refresh_token": tokens["refresh_token"]})

    assert response.status_code == 200
    assert (await _refresh(client, tokens["refresh_token"])).status_code == 401


async def test_logout_without_body_still_succeeds(client: AsyncClient, test_user):
    response = await client.post("/api/auth/logout")

    assert response.status_code == 200
    assert response.json() == {"detail": "Logged out"}


async def test_2fa_verify_with_remember_returns_refresh_token(
    client: AsyncClient, test_user, session: AsyncSession
):
    secret = pyotp.random_base32()
    test_user.totp_secret = secret
    test_user.is_2fa_enabled = True
    session.add(test_user)
    await session.commit()

    challenge = await _login(client)
    assert challenge["requires_2fa"] is True
    assert "refresh_token" not in challenge

    response = await client.post(
        "/api/auth/2fa/verify?remember=true",
        json={"temp_token": challenge["temp_token"], "code": pyotp.TOTP(secret).now()},
    )

    assert response.status_code == 200
    assert response.json()["refresh_token"]
    assert (await _refresh(client, response.json()["refresh_token"])).status_code == 200


async def test_sessions_lists_one_entry_per_signed_in_device(client: AsyncClient, test_user):
    phone = await _login(client, headers={"X-Device-Name": "Phone"})
    await _login(client, headers={"X-Device-Name": "Tablet"})
    # Rotation replaces the phone's row but it is still one session.
    await _refresh(client, phone["refresh_token"])

    response = await client.get(
        "/api/auth/sessions", headers={"Authorization": f"Bearer {phone['access_token']}"}
    )

    assert response.status_code == 200
    assert sorted(s["device_name"] for s in response.json()) == ["Phone", "Tablet"]


async def test_deleting_a_session_signs_that_device_out(client: AsyncClient, test_user):
    phone = await _login(client, headers={"X-Device-Name": "Phone"})
    headers = {"Authorization": f"Bearer {phone['access_token']}"}
    [listed] = (await client.get("/api/auth/sessions", headers=headers)).json()

    response = await client.delete(f"/api/auth/sessions/{listed['id']}", headers=headers)

    assert response.status_code == 204
    assert (await _refresh(client, phone["refresh_token"])).status_code == 401


async def test_sessions_are_scoped_to_their_owner(
    client: AsyncClient, test_user, test_superuser
):
    await _login(client)
    owner_headers = {"Authorization": f"Bearer {await get_jwt_strategy().write_token(test_user)}"}
    [listed] = (await client.get("/api/auth/sessions", headers=owner_headers)).json()

    other = {"Authorization": f"Bearer {await get_jwt_strategy().write_token(test_superuser)}"}
    assert (await client.get("/api/auth/sessions", headers=other)).json() == []
    response = await client.delete(f"/api/auth/sessions/{listed['id']}", headers=other)
    assert response.status_code == 404


async def test_password_change_revokes_refresh_tokens(client: AsyncClient, test_user):
    tokens = await _login(client)

    response = await client.patch(
        "/api/users/me",
        json={"password": "a-brand-new-passphrase"},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )

    assert response.status_code == 200
    assert (await _refresh(client, tokens["refresh_token"])).status_code == 401


async def test_admin_password_reset_revokes_refresh_tokens(
    client: AsyncClient, test_user, test_superuser
):
    tokens = await _login(client)
    admin = {"Authorization": f"Bearer {await get_jwt_strategy().write_token(test_superuser)}"}

    response = await client.patch(
        f"/api/admin/users/{test_user.id}",
        json={"password": "reset-by-the-admin"},
        headers=admin,
    )

    assert response.status_code == 200
    assert (await _refresh(client, tokens["refresh_token"])).status_code == 401


async def test_refresh_has_its_own_rate_limit(client: AsyncClient, test_user):
    # Background refreshes must not share the 5/min sign-in budget.
    from fastapi import HTTPException

    tokens = await _login(client)

    def _exhausted():
        raise HTTPException(status_code=429, detail="Too many requests")

    app.dependency_overrides[login_rate_limit] = _exhausted
    try:
        assert (await _refresh(client, tokens["refresh_token"])).status_code == 200
    finally:
        del app.dependency_overrides[login_rate_limit]

    app.dependency_overrides[refresh_rate_limit] = _exhausted
    try:
        assert (await _refresh(client, tokens["refresh_token"])).status_code == 429
    finally:
        del app.dependency_overrides[refresh_rate_limit]
