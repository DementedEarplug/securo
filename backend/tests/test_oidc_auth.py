import base64
import hashlib
import json
from urllib.parse import parse_qs, urlparse

import pytest
from pydantic import SecretStr
from httpx import AsyncClient
from sqlalchemy import select

from app.api import oidc_auth
from app.core.config import get_settings
from app.models.app_settings import AppSetting
from app.models.workspace import WorkspaceMember


class FakeRedis:
    def __init__(self):
        self.store = {}
        self.ttls = {}

    async def set(self, key, value, ex=None):
        self.store[key] = value
        self.ttls[key] = ex

    async def get(self, key):
        return self.store.get(key)

    async def getdel(self, key):
        return self.store.pop(key, None)

    async def delete(self, key):
        self.store.pop(key, None)


@pytest.fixture
def oidc_settings(monkeypatch):
    settings = get_settings()
    old = settings.model_dump()
    settings.oidc_enabled = True
    settings.oidc_provider_name = "Pocket ID"
    settings.oidc_discovery_url = "https://id.example.com/.well-known/openid-configuration"
    settings.oidc_client_id = "securo"
    settings.oidc_client_secret = SecretStr("secret")
    settings.frontend_url = "http://test"
    settings.oidc_sync_roles = False
    settings.oidc_roles_claim = "groups"
    settings.oidc_admin_roles = ""
    settings.oidc_workspace_role_map = ""
    yield settings
    for key, value in old.items():
        setattr(settings, key, value)


@pytest.mark.asyncio
async def test_decode_id_token_accepts_google_style_at_hash(monkeypatch, oidc_settings):
    """Google id_token carrying at_hash must validate (regression for the
    'Invalid OIDC id_token' failure: jwt.decode got no access_token)."""
    import time

    from cryptography.hazmat.primitives.asymmetric import rsa
    from jose import jwt as jose_jwt
    from jose.backends.cryptography_backend import CryptographyRSAKey
    from jose.constants import ALGORITHMS

    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv_jwk = CryptographyRSAKey(private, ALGORITHMS.RS256).to_dict()
    pub_jwk = CryptographyRSAKey(private.public_key(), ALGORITHMS.RS256).to_dict()
    pub_jwk.update({"kid": "test-key", "alg": "RS256", "use": "sig"})

    access_token = "ya29.google-access-token"
    issuer = "https://accounts.google.com"
    now = int(time.time())
    id_token = jose_jwt.encode(
        {
            "iss": issuer,
            "aud": oidc_settings.oidc_client_id,
            "sub": "google-sub-123",
            "email": "user@gmail.com",
            "email_verified": True,
            "nonce": "nonce123",
            "iat": now,
            "exp": now + 600,
        },
        priv_jwk,
        algorithm="RS256",
        headers={"kid": "test-key"},
        access_token=access_token,
    )
    assert "at_hash" in jose_jwt.get_unverified_claims(id_token)

    class _Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"keys": [pub_jwk]}

    class _FakeAsyncClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, **k):
            return _Resp()

    monkeypatch.setattr(oidc_auth.httpx, "AsyncClient", _FakeAsyncClient)

    discovery = {"jwks_uri": "https://accounts.google.com/jwks", "issuer": issuer}
    claims = await oidc_auth._decode_id_token(discovery, id_token, "nonce123", access_token)
    assert claims["sub"] == "google-sub-123"
    assert claims["email"] == "user@gmail.com"


@pytest.mark.asyncio
async def test_oidc_config_disabled_by_default(client: AsyncClient, clean_db):
    response = await client.get("/api/auth/oidc/config")
    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is False
    assert data["local_auth_enabled"] is True


@pytest.mark.asyncio
async def test_oidc_config_exposes_local_auth_disabled(client: AsyncClient, clean_db, oidc_settings):
    oidc_settings.local_auth_enabled = False

    response = await client.get("/api/auth/oidc/config")

    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is True
    assert data["provider_name"] == "Pocket ID"
    assert data["local_auth_enabled"] is False


@pytest.mark.asyncio
async def test_oidc_login_redirects_to_provider(client: AsyncClient, clean_db, oidc_settings, monkeypatch):
    fake_redis = FakeRedis()

    async def fake_discover():
        return {"authorization_endpoint": "https://id.example.com/authorize"}

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(oidc_auth, "get_redis", fake_get_redis)
    monkeypatch.setattr(oidc_auth, "_discover", fake_discover)

    response = await client.get("/api/auth/oidc/login", follow_redirects=False)
    assert response.status_code == 307
    location = response.headers["location"]
    parsed = urlparse(location)
    params = parse_qs(parsed.query)
    assert parsed.scheme == "https"
    assert parsed.netloc == "id.example.com"
    assert parsed.path == "/authorize"
    assert params["client_id"] == ["securo"]
    assert params["scope"] == ["openid email profile"]
    assert params["redirect_uri"] == ["http://test/api/auth/oidc/callback"]
    assert params["code_challenge_method"] == ["S256"]
    assert params["code_challenge"][0]
    stored = json.loads(fake_redis.store[f"oidc_state:{params['state'][0]}"])
    expected_challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(stored["code_verifier"].encode()).digest())
        .rstrip(b"=")
        .decode()
    )
    assert params["code_challenge"][0] == expected_challenge


@pytest.mark.asyncio
async def test_oidc_callback_creates_user_and_redirects_with_securo_token(
    client: AsyncClient, clean_db, oidc_settings, monkeypatch
):
    fake_redis = FakeRedis()
    await fake_redis.set("oidc_state:state123", json.dumps({"nonce": "nonce123"}))

    async def fake_discover():
        return {"issuer": "https://id.example.com"}

    async def fake_exchange(discovery, code, code_verifier=""):
        assert code == "abc"
        return {"id_token": "id-token", "access_token": "provider-token"}

    async def fake_decode(discovery, id_token, nonce, access_token=""):
        assert id_token == "id-token"
        assert nonce == "nonce123"
        return {"sub": "user-sub", "email": "oidc@example.com", "email_verified": True, "name": "OIDC User"}

    async def fake_userinfo(discovery, access_token):
        assert access_token == "provider-token"
        return {}

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(oidc_auth, "get_redis", fake_get_redis)
    monkeypatch.setattr(oidc_auth, "_discover", fake_discover)
    monkeypatch.setattr(oidc_auth, "_exchange_code", fake_exchange)
    monkeypatch.setattr(oidc_auth, "_decode_id_token", fake_decode)
    monkeypatch.setattr(oidc_auth, "_fetch_userinfo", fake_userinfo)

    response = await client.get("/api/auth/oidc/callback?code=abc&state=state123", follow_redirects=False)
    assert response.status_code == 307
    location = response.headers["location"]
    assert location.startswith("http://test/auth/oidc/callback#access_token=")

    token = parse_qs(urlparse(location).fragment)["access_token"][0]
    me = await client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "oidc@example.com"


@pytest.mark.asyncio
async def test_oidc_callback_syncs_existing_user_admin_and_workspace_role(
    client: AsyncClient, session, test_user, oidc_settings, monkeypatch
):
    oidc_settings.oidc_sync_roles = True
    oidc_settings.oidc_admin_roles = "securo-admins"
    test_user.oidc_issuer = "https://id.example.com"
    test_user.oidc_subject = "user-sub"
    session.add(test_user)
    await session.commit()
    oidc_settings.oidc_workspace_role_map = json.dumps(
        {
            "securo-viewers": "viewer",
            "securo-editors": "editor",
            "securo-owners": "owner",
        }
    )
    fake_redis = FakeRedis()
    await fake_redis.set("oidc_state:state123", json.dumps({"nonce": "nonce123"}))

    async def fake_discover():
        return {"issuer": "https://id.example.com"}

    async def fake_exchange(discovery, code, code_verifier=""):
        return {"id_token": "id-token", "access_token": "provider-token"}

    async def fake_decode(discovery, id_token, nonce, access_token=""):
        return {
            "sub": "user-sub",
            "email": "test@example.com",
            "email_verified": True,
            "groups": ["securo-admins", "securo-editors"],
        }

    async def fake_userinfo(discovery, access_token):
        return {}

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(oidc_auth, "get_redis", fake_get_redis)
    monkeypatch.setattr(oidc_auth, "_discover", fake_discover)
    monkeypatch.setattr(oidc_auth, "_exchange_code", fake_exchange)
    monkeypatch.setattr(oidc_auth, "_decode_id_token", fake_decode)
    monkeypatch.setattr(oidc_auth, "_fetch_userinfo", fake_userinfo)

    response = await client.get("/api/auth/oidc/callback?code=abc&state=state123", follow_redirects=False)
    assert response.status_code == 307
    token = parse_qs(urlparse(response.headers["location"]).fragment)["access_token"][0]

    me = await client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["is_superuser"] is True

    workspace = await client.get("/api/workspaces/current", headers={"Authorization": f"Bearer {token}"})
    assert workspace.status_code == 200
    assert workspace.json()["role"] == "owner"

    member = (
        await session.execute(select(WorkspaceMember).where(WorkspaceMember.user_id == test_user.id))
    ).scalars().first()
    assert member.role == "owner"


@pytest.mark.asyncio
async def test_oidc_callback_sync_roles_can_revoke_admin(
    client: AsyncClient, session, test_superuser, oidc_settings, monkeypatch
):
    oidc_settings.oidc_sync_roles = True
    oidc_settings.oidc_admin_roles = "securo-admins"
    test_superuser.oidc_issuer = "https://id.example.com"
    test_superuser.oidc_subject = "user-sub"
    session.add(test_superuser)
    await session.commit()
    fake_redis = FakeRedis()
    await fake_redis.set("oidc_state:state123", json.dumps({"nonce": "nonce123"}))

    async def fake_discover():
        return {"issuer": "https://id.example.com"}

    async def fake_exchange(discovery, code, code_verifier=""):
        return {"id_token": "id-token", "access_token": "provider-token"}

    async def fake_decode(discovery, id_token, nonce, access_token=""):
        return {
            "sub": "user-sub",
            "email": "admin@example.com",
            "email_verified": True,
            "groups": ["securo-users"],
        }

    async def fake_userinfo(discovery, access_token):
        return {}

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(oidc_auth, "get_redis", fake_get_redis)
    monkeypatch.setattr(oidc_auth, "_discover", fake_discover)
    monkeypatch.setattr(oidc_auth, "_exchange_code", fake_exchange)
    monkeypatch.setattr(oidc_auth, "_decode_id_token", fake_decode)
    monkeypatch.setattr(oidc_auth, "_fetch_userinfo", fake_userinfo)

    response = await client.get("/api/auth/oidc/callback?code=abc&state=state123", follow_redirects=False)
    assert response.status_code == 307
    token = parse_qs(urlparse(response.headers["location"]).fragment)["access_token"][0]

    me = await client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["is_superuser"] is False


@pytest.mark.asyncio
async def test_oidc_callback_signed_claims_override_userinfo_roles(
    client: AsyncClient, clean_db, oidc_settings, monkeypatch
):
    oidc_settings.oidc_sync_roles = True
    oidc_settings.oidc_admin_roles = "securo-admins"
    fake_redis = FakeRedis()
    await fake_redis.set("oidc_state:state123", json.dumps({"nonce": "nonce123"}))

    async def fake_discover():
        return {"issuer": "https://id.example.com"}

    async def fake_exchange(discovery, code, code_verifier=""):
        return {"id_token": "id-token", "access_token": "provider-token"}

    async def fake_decode(discovery, id_token, nonce, access_token=""):
        return {
            "sub": "signed-sub",
            "email": "userinfo-override@example.com",
            "email_verified": True,
            "groups": ["securo-users"],
        }

    async def fake_userinfo(discovery, access_token):
        return {
            "sub": "signed-sub",
            "email": "attacker@example.com",
            "email_verified": True,
            "groups": ["securo-admins"],
        }

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(oidc_auth, "get_redis", fake_get_redis)
    monkeypatch.setattr(oidc_auth, "_discover", fake_discover)
    monkeypatch.setattr(oidc_auth, "_exchange_code", fake_exchange)
    monkeypatch.setattr(oidc_auth, "_decode_id_token", fake_decode)
    monkeypatch.setattr(oidc_auth, "_fetch_userinfo", fake_userinfo)

    response = await client.get("/api/auth/oidc/callback?code=abc&state=state123", follow_redirects=False)
    assert response.status_code == 307
    token = parse_qs(urlparse(response.headers["location"]).fragment)["access_token"][0]

    me = await client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "userinfo-override@example.com"
    assert me.json()["is_superuser"] is False


@pytest.mark.asyncio
async def test_oidc_callback_rejects_userinfo_subject_mismatch(
    client: AsyncClient, clean_db, oidc_settings, monkeypatch
):
    fake_redis = FakeRedis()
    await fake_redis.set("oidc_state:state123", json.dumps({"nonce": "nonce123"}))

    async def fake_discover():
        return {"issuer": "https://id.example.com"}

    async def fake_exchange(discovery, code, code_verifier=""):
        return {"id_token": "id-token", "access_token": "provider-token"}

    async def fake_decode(discovery, id_token, nonce, access_token=""):
        return {"sub": "signed-sub", "email": "oidc@example.com", "email_verified": True}

    async def fake_userinfo(discovery, access_token):
        return {"sub": "different-sub", "email": "oidc@example.com", "email_verified": True}

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(oidc_auth, "get_redis", fake_get_redis)
    monkeypatch.setattr(oidc_auth, "_discover", fake_discover)
    monkeypatch.setattr(oidc_auth, "_exchange_code", fake_exchange)
    monkeypatch.setattr(oidc_auth, "_decode_id_token", fake_decode)
    monkeypatch.setattr(oidc_auth, "_fetch_userinfo", fake_userinfo)

    response = await client.get("/api/auth/oidc/callback?code=abc&state=state123")
    assert response.status_code == 400
    assert response.json()["detail"] == "OIDC userinfo subject does not match id_token subject"


@pytest.mark.asyncio
async def test_oidc_callback_requires_verified_email_claim_when_enabled(
    client: AsyncClient, clean_db, oidc_settings, monkeypatch
):
    fake_redis = FakeRedis()
    await fake_redis.set("oidc_state:state123", json.dumps({"nonce": "nonce123"}))

    async def fake_discover():
        return {"issuer": "https://id.example.com"}

    async def fake_exchange(discovery, code, code_verifier=""):
        return {"id_token": "id-token", "access_token": "provider-token"}

    async def fake_decode(discovery, id_token, nonce, access_token=""):
        return {"sub": "signed-sub", "email": "oidc@example.com"}

    async def fake_userinfo(discovery, access_token):
        return {}

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(oidc_auth, "get_redis", fake_get_redis)
    monkeypatch.setattr(oidc_auth, "_discover", fake_discover)
    monkeypatch.setattr(oidc_auth, "_exchange_code", fake_exchange)
    monkeypatch.setattr(oidc_auth, "_decode_id_token", fake_decode)
    monkeypatch.setattr(oidc_auth, "_fetch_userinfo", fake_userinfo)

    response = await client.get("/api/auth/oidc/callback?code=abc&state=state123")
    assert response.status_code == 400
    assert response.json()["detail"] == "OIDC email is not verified"


@pytest.mark.asyncio
async def test_oidc_callback_rejects_unlinked_existing_user_by_default(
    client: AsyncClient, test_user, oidc_settings, monkeypatch
):
    fake_redis = FakeRedis()
    await fake_redis.set("oidc_state:state123", json.dumps({"nonce": "nonce123"}))

    async def fake_discover():
        return {"issuer": "https://id.example.com"}

    async def fake_exchange(discovery, code, code_verifier=""):
        return {"id_token": "id-token", "access_token": "provider-token"}

    async def fake_decode(discovery, id_token, nonce, access_token=""):
        return {"sub": "new-sub", "email": "test@example.com", "email_verified": True}

    async def fake_userinfo(discovery, access_token):
        return {}

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(oidc_auth, "get_redis", fake_get_redis)
    monkeypatch.setattr(oidc_auth, "_discover", fake_discover)
    monkeypatch.setattr(oidc_auth, "_exchange_code", fake_exchange)
    monkeypatch.setattr(oidc_auth, "_decode_id_token", fake_decode)
    monkeypatch.setattr(oidc_auth, "_fetch_userinfo", fake_userinfo)

    response = await client.get("/api/auth/oidc/callback?code=abc&state=state123")

    assert response.status_code == 403
    assert response.json()["detail"] == "Existing account is not linked to this OIDC identity"


@pytest.mark.asyncio
async def test_oidc_callback_verified_email_link_mode_links_existing_user(
    client: AsyncClient, session, test_user, oidc_settings, monkeypatch
):
    oidc_settings.oidc_existing_user_link_mode = "verified_email"
    fake_redis = FakeRedis()
    await fake_redis.set("oidc_state:state123", json.dumps({"nonce": "nonce123"}))

    async def fake_discover():
        return {"issuer": "https://id.example.com"}

    async def fake_exchange(discovery, code, code_verifier=""):
        return {"id_token": "id-token", "access_token": "provider-token"}

    async def fake_decode(discovery, id_token, nonce, access_token=""):
        return {"sub": "linked-sub", "email": "test@example.com", "email_verified": True}

    async def fake_userinfo(discovery, access_token):
        return {}

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(oidc_auth, "get_redis", fake_get_redis)
    monkeypatch.setattr(oidc_auth, "_discover", fake_discover)
    monkeypatch.setattr(oidc_auth, "_exchange_code", fake_exchange)
    monkeypatch.setattr(oidc_auth, "_decode_id_token", fake_decode)
    monkeypatch.setattr(oidc_auth, "_fetch_userinfo", fake_userinfo)

    response = await client.get("/api/auth/oidc/callback?code=abc&state=state123", follow_redirects=False)

    assert response.status_code == 307
    await session.refresh(test_user)
    assert test_user.oidc_issuer == "https://id.example.com"
    assert test_user.oidc_subject == "linked-sub"


@pytest.mark.asyncio
async def test_oidc_callback_rejects_existing_user_with_different_linked_subject(
    client: AsyncClient, session, test_user, oidc_settings, monkeypatch
):
    oidc_settings.oidc_existing_user_link_mode = "verified_email"
    test_user.oidc_issuer = "https://id.example.com"
    test_user.oidc_subject = "original-sub"
    session.add(test_user)
    await session.commit()
    fake_redis = FakeRedis()
    await fake_redis.set("oidc_state:state123", json.dumps({"nonce": "nonce123"}))

    async def fake_discover():
        return {"issuer": "https://id.example.com"}

    async def fake_exchange(discovery, code, code_verifier=""):
        return {"id_token": "id-token", "access_token": "provider-token"}

    async def fake_decode(discovery, id_token, nonce, access_token=""):
        return {"sub": "different-sub", "email": "test@example.com", "email_verified": True}

    async def fake_userinfo(discovery, access_token):
        return {}

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(oidc_auth, "get_redis", fake_get_redis)
    monkeypatch.setattr(oidc_auth, "_discover", fake_discover)
    monkeypatch.setattr(oidc_auth, "_exchange_code", fake_exchange)
    monkeypatch.setattr(oidc_auth, "_decode_id_token", fake_decode)
    monkeypatch.setattr(oidc_auth, "_fetch_userinfo", fake_userinfo)

    response = await client.get("/api/auth/oidc/callback?code=abc&state=state123")

    assert response.status_code == 403
    assert response.json()["detail"] == "OIDC identity is linked to a different account"


@pytest.mark.asyncio
async def test_oidc_callback_respects_disabled_registration_setting(
    client: AsyncClient, session, clean_db, oidc_settings, monkeypatch
):
    oidc_settings.registration_enabled = True
    oidc_settings.oidc_auto_register = True
    session.add(AppSetting(key="registration_enabled", value="false"))
    await session.commit()
    fake_redis = FakeRedis()
    await fake_redis.set("oidc_state:state123", json.dumps({"nonce": "nonce123"}))

    async def fake_discover():
        return {"issuer": "https://id.example.com"}

    async def fake_exchange(discovery, code, code_verifier=""):
        return {"id_token": "id-token", "access_token": "provider-token"}

    async def fake_decode(discovery, id_token, nonce, access_token=""):
        return {"sub": "new-sub", "email": "new@example.com", "email_verified": True}

    async def fake_userinfo(discovery, access_token):
        return {}

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(oidc_auth, "get_redis", fake_get_redis)
    monkeypatch.setattr(oidc_auth, "_discover", fake_discover)
    monkeypatch.setattr(oidc_auth, "_exchange_code", fake_exchange)
    monkeypatch.setattr(oidc_auth, "_decode_id_token", fake_decode)
    monkeypatch.setattr(oidc_auth, "_fetch_userinfo", fake_userinfo)

    response = await client.get("/api/auth/oidc/callback?code=abc&state=state123")

    assert response.status_code == 403
    assert response.json()["detail"] == "Registration is disabled"


@pytest.mark.asyncio
async def test_oidc_callback_email_link_mode_links_existing_user_without_verified_email(
    client: AsyncClient, session, test_user, oidc_settings, monkeypatch
):
    oidc_settings.oidc_existing_user_link_mode = "email"
    fake_redis = FakeRedis()
    await fake_redis.set("oidc_state:state123", json.dumps({"nonce": "nonce123"}))

    async def fake_discover():
        return {"issuer": "https://id.example.com"}

    async def fake_exchange(discovery, code, code_verifier=""):
        return {"id_token": "id-token", "access_token": "provider-token"}

    async def fake_decode(discovery, id_token, nonce, access_token=""):
        return {"sub": "unverified-linked-sub", "email": "test@example.com"}

    async def fake_userinfo(discovery, access_token):
        return {}

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(oidc_auth, "get_redis", fake_get_redis)
    monkeypatch.setattr(oidc_auth, "_discover", fake_discover)
    monkeypatch.setattr(oidc_auth, "_exchange_code", fake_exchange)
    monkeypatch.setattr(oidc_auth, "_decode_id_token", fake_decode)
    monkeypatch.setattr(oidc_auth, "_fetch_userinfo", fake_userinfo)

    response = await client.get("/api/auth/oidc/callback?code=abc&state=state123", follow_redirects=False)

    assert response.status_code == 307
    await session.refresh(test_user)
    assert test_user.oidc_issuer == "https://id.example.com"
    assert test_user.oidc_subject == "unverified-linked-sub"


@pytest.mark.asyncio
async def test_oidc_callback_linked_user_can_login_without_verified_email_when_required(
    client: AsyncClient, session, test_user, oidc_settings, monkeypatch
):
    oidc_settings.oidc_require_verified_email = True
    oidc_settings.oidc_existing_user_link_mode = "verified_email"
    test_user.oidc_issuer = "https://id.example.com"
    test_user.oidc_subject = "linked-sub"
    session.add(test_user)
    await session.commit()
    fake_redis = FakeRedis()
    await fake_redis.set("oidc_state:state123", json.dumps({"nonce": "nonce123"}))

    async def fake_discover():
        return {"issuer": "https://id.example.com"}

    async def fake_exchange(discovery, code, code_verifier=""):
        return {"id_token": "id-token", "access_token": "provider-token"}

    async def fake_decode(discovery, id_token, nonce, access_token=""):
        return {"sub": "linked-sub", "email": "test@example.com"}

    async def fake_userinfo(discovery, access_token):
        return {}

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(oidc_auth, "get_redis", fake_get_redis)
    monkeypatch.setattr(oidc_auth, "_discover", fake_discover)
    monkeypatch.setattr(oidc_auth, "_exchange_code", fake_exchange)
    monkeypatch.setattr(oidc_auth, "_decode_id_token", fake_decode)
    monkeypatch.setattr(oidc_auth, "_fetch_userinfo", fake_userinfo)

    response = await client.get("/api/auth/oidc/callback?code=abc&state=state123", follow_redirects=False)

    assert response.status_code == 307


@pytest.mark.asyncio
async def test_oidc_callback_linked_user_can_login_without_email_claim(
    client: AsyncClient, session, test_user, oidc_settings, monkeypatch
):
    oidc_settings.oidc_require_verified_email = True
    test_user.oidc_issuer = "https://id.example.com"
    test_user.oidc_subject = "linked-sub"
    session.add(test_user)
    await session.commit()
    fake_redis = FakeRedis()
    await fake_redis.set("oidc_state:state123", json.dumps({"nonce": "nonce123"}))

    async def fake_discover():
        return {"issuer": "https://id.example.com"}

    async def fake_exchange(discovery, code, code_verifier=""):
        return {"id_token": "id-token", "access_token": "provider-token"}

    async def fake_decode(discovery, id_token, nonce, access_token=""):
        return {"sub": "linked-sub"}

    async def fake_userinfo(discovery, access_token):
        return {}

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(oidc_auth, "get_redis", fake_get_redis)
    monkeypatch.setattr(oidc_auth, "_discover", fake_discover)
    monkeypatch.setattr(oidc_auth, "_exchange_code", fake_exchange)
    monkeypatch.setattr(oidc_auth, "_decode_id_token", fake_decode)
    monkeypatch.setattr(oidc_auth, "_fetch_userinfo", fake_userinfo)

    response = await client.get("/api/auth/oidc/callback?code=abc&state=state123", follow_redirects=False)

    assert response.status_code == 307


@pytest.mark.asyncio
async def test_oidc_callback_registration_disabled_does_not_block_existing_email_link(
    client: AsyncClient, session, test_user, oidc_settings, monkeypatch
):
    oidc_settings.oidc_existing_user_link_mode = "email"
    session.add(AppSetting(key="registration_enabled", value="false"))
    await session.commit()
    fake_redis = FakeRedis()
    await fake_redis.set("oidc_state:state123", json.dumps({"nonce": "nonce123"}))

    async def fake_discover():
        return {"issuer": "https://id.example.com"}

    async def fake_exchange(discovery, code, code_verifier=""):
        return {"id_token": "id-token", "access_token": "provider-token"}

    async def fake_decode(discovery, id_token, nonce, access_token=""):
        return {"sub": "linked-with-registration-disabled", "email": "test@example.com"}

    async def fake_userinfo(discovery, access_token):
        return {}

    async def fake_get_redis():
        return fake_redis

    monkeypatch.setattr(oidc_auth, "get_redis", fake_get_redis)
    monkeypatch.setattr(oidc_auth, "_discover", fake_discover)
    monkeypatch.setattr(oidc_auth, "_exchange_code", fake_exchange)
    monkeypatch.setattr(oidc_auth, "_decode_id_token", fake_decode)
    monkeypatch.setattr(oidc_auth, "_fetch_userinfo", fake_userinfo)

    response = await client.get("/api/auth/oidc/callback?code=abc&state=state123", follow_redirects=False)

    assert response.status_code == 307
    await session.refresh(test_user)
    assert test_user.oidc_subject == "linked-with-registration-disabled"


# --- Native app (Android) sign-in: one-time code + PKCE ----------------------

APP_REDIRECT = "securo://oidc"


def _pkce(verifier: str = "v" * 43) -> tuple[str, str]:
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


@pytest.fixture
def native_oidc(oidc_settings, monkeypatch):
    """OIDC with the native flow allowed, and a fake IdP that signs in one user."""
    oidc_settings.oidc_native_redirect_uris = APP_REDIRECT
    fake_redis = FakeRedis()

    async def fake_get_redis():
        return fake_redis

    async def fake_discover():
        return {"issuer": "https://id.example.com", "authorization_endpoint": "https://id.example.com/authorize"}

    async def fake_exchange(discovery, code, code_verifier=""):
        if code != "idp-code":
            raise oidc_auth.HTTPException(status_code=400, detail="Invalid OIDC id_token")
        return {"id_token": "id-token", "access_token": "provider-token"}

    async def fake_decode(discovery, id_token, nonce, access_token=""):
        return {"sub": "app-sub", "email": "app@example.com", "email_verified": True, "name": "App User"}

    async def fake_userinfo(discovery, access_token):
        return {}

    monkeypatch.setattr(oidc_auth, "get_redis", fake_get_redis)
    monkeypatch.setattr(oidc_auth, "_discover", fake_discover)
    monkeypatch.setattr(oidc_auth, "_exchange_code", fake_exchange)
    monkeypatch.setattr(oidc_auth, "_decode_id_token", fake_decode)
    monkeypatch.setattr(oidc_auth, "_fetch_userinfo", fake_userinfo)
    return fake_redis


async def _start_native_login(client: AsyncClient, challenge: str) -> str:
    response = await client.get(
        "/api/auth/oidc/login",
        params={"app_redirect": APP_REDIRECT, "app_code_challenge": challenge},
        follow_redirects=False,
    )
    assert response.status_code == 307
    return parse_qs(urlparse(response.headers["location"]).query)["state"][0]


async def _app_code(client: AsyncClient, challenge: str) -> str:
    state = await _start_native_login(client, challenge)
    response = await client.get(f"/api/auth/oidc/callback?code=idp-code&state={state}", follow_redirects=False)
    assert response.status_code == 307
    location = response.headers["location"]
    assert location.startswith(f"{APP_REDIRECT}?code=")
    return parse_qs(urlparse(location).query)["code"][0]


@pytest.mark.asyncio
async def test_oidc_config_lists_native_redirects_only_when_enabled(client: AsyncClient, clean_db, oidc_settings):
    assert (await client.get("/api/auth/oidc/config")).json()["native_redirect_uris"] == []
    oidc_settings.oidc_native_redirect_uris = APP_REDIRECT
    assert (await client.get("/api/auth/oidc/config")).json()["native_redirect_uris"] == [APP_REDIRECT]
    oidc_settings.oidc_enabled = False
    assert (await client.get("/api/auth/oidc/config")).json()["native_redirect_uris"] == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "params",
    [
        {"app_redirect": "securo://evil", "app_code_challenge": _pkce()[1]},
        {"app_redirect": "securo://oidc/extra", "app_code_challenge": _pkce()[1]},
        {"app_code_challenge": _pkce()[1]},
        {"app_redirect": APP_REDIRECT},
        {"app_redirect": APP_REDIRECT, "app_code_challenge": "short"},
        {"app_redirect": APP_REDIRECT, "app_code_challenge": "v" * 43, "app_code_challenge_method": "plain"},
    ],
)
async def test_oidc_native_login_rejects_bad_parameters(client: AsyncClient, clean_db, native_oidc, params):
    response = await client.get("/api/auth/oidc/login", params=params, follow_redirects=False)
    assert response.status_code == 400
    assert native_oidc.store == {}


@pytest.mark.asyncio
async def test_oidc_native_login_is_refused_when_not_allow_listed(client: AsyncClient, clean_db, native_oidc, oidc_settings):
    oidc_settings.oidc_native_redirect_uris = ""
    response = await client.get(
        "/api/auth/oidc/login",
        params={"app_redirect": APP_REDIRECT, "app_code_challenge": _pkce()[1]},
        follow_redirects=False,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_oidc_native_flow_exchanges_code_for_a_refreshable_session(client: AsyncClient, clean_db, native_oidc):
    verifier, challenge = _pkce()
    state = await _start_native_login(client, challenge)
    stored = json.loads(native_oidc.store[f"oidc_state:{state}"])
    assert stored["app_redirect"] == APP_REDIRECT
    assert stored["app_code_challenge"] == challenge

    response = await client.get(f"/api/auth/oidc/callback?code=idp-code&state={state}", follow_redirects=False)
    location = response.headers["location"]
    assert location.startswith(f"{APP_REDIRECT}?code=")
    assert "access_token" not in location
    code = parse_qs(urlparse(location).query)["code"][0]
    # Only a hash of the code is stored, with a short lifetime.
    (key,) = [k for k in native_oidc.store if k.startswith("oidc_app_code:")]
    assert code not in key
    assert native_oidc.ttls[key] == oidc_auth.OIDC_APP_CODE_TTL

    exchanged = await client.post("/api/auth/oidc/exchange", json={"code": code, "code_verifier": verifier})
    assert exchanged.status_code == 200
    body = exchanged.json()
    assert body["refresh_token"]
    me = await client.get("/api/users/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json()["email"] == "app@example.com"

    refreshed = await client.post("/api/auth/refresh", json={"refresh_token": body["refresh_token"]})
    assert refreshed.status_code == 200


@pytest.mark.asyncio
async def test_oidc_native_code_is_single_use(client: AsyncClient, clean_db, native_oidc):
    verifier, challenge = _pkce()
    code = await _app_code(client, challenge)
    first = await client.post("/api/auth/oidc/exchange", json={"code": code, "code_verifier": verifier})
    assert first.status_code == 200
    second = await client.post("/api/auth/oidc/exchange", json={"code": code, "code_verifier": verifier})
    assert second.status_code == 400


@pytest.mark.asyncio
async def test_oidc_native_wrong_verifier_burns_the_code(client: AsyncClient, clean_db, native_oidc):
    verifier, challenge = _pkce()
    code = await _app_code(client, challenge)
    wrong = await client.post("/api/auth/oidc/exchange", json={"code": code, "code_verifier": "w" * 43})
    assert wrong.status_code == 400
    retry = await client.post("/api/auth/oidc/exchange", json={"code": code, "code_verifier": verifier})
    assert retry.status_code == 400


@pytest.mark.asyncio
async def test_oidc_native_expired_code_is_rejected(client: AsyncClient, clean_db, native_oidc):
    verifier, challenge = _pkce()
    code = await _app_code(client, challenge)
    # Redis drops the key at its TTL; simulate that.
    native_oidc.store.clear()
    response = await client.post("/api/auth/oidc/exchange", json={"code": code, "code_verifier": verifier})
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_oidc_native_exchange_rejects_malformed_verifier(client: AsyncClient, clean_db, native_oidc):
    _, challenge = _pkce()
    code = await _app_code(client, challenge)
    response = await client.post("/api/auth/oidc/exchange", json={"code": code, "code_verifier": "short"})
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_oidc_native_exchange_is_off_without_allow_list(client: AsyncClient, clean_db, native_oidc, oidc_settings):
    oidc_settings.oidc_native_redirect_uris = ""
    response = await client.post("/api/auth/oidc/exchange", json={"code": "x", "code_verifier": "v" * 43})
    assert response.status_code == 404


def test_oidc_native_exchange_is_rate_limited():
    from fastapi.routing import APIRoute

    from app.core.rate_limit import login_rate_limit

    route = next(
        r for r in oidc_auth.router.routes if isinstance(r, APIRoute) and r.path == "/api/auth/oidc/exchange"
    )
    assert any(d.call is login_rate_limit for d in route.dependant.dependencies)


@pytest.mark.asyncio
async def test_oidc_native_callback_returns_provider_errors_to_the_app(client: AsyncClient, clean_db, native_oidc):
    _, challenge = _pkce()
    state = await _start_native_login(client, challenge)
    response = await client.get(f"/api/auth/oidc/callback?error=access_denied&state={state}", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == f"{APP_REDIRECT}?error=access_denied"
    assert not any(k.startswith("oidc_app_code:") for k in native_oidc.store)


@pytest.mark.asyncio
async def test_oidc_native_callback_returns_sign_in_failures_to_the_app(client: AsyncClient, clean_db, native_oidc):
    _, challenge = _pkce()
    state = await _start_native_login(client, challenge)
    response = await client.get(f"/api/auth/oidc/callback?code=bad-code&state={state}", follow_redirects=False)
    params = parse_qs(urlparse(response.headers["location"]).query)
    assert params["error"] == ["access_denied"]
    assert params["error_description"] == ["Invalid OIDC id_token"]
    assert not any(k.startswith("oidc_app_code:") for k in native_oidc.store)


@pytest.mark.asyncio
async def test_oidc_native_callback_rechecks_the_allow_list(client: AsyncClient, clean_db, native_oidc, oidc_settings):
    _, challenge = _pkce()
    state = await _start_native_login(client, challenge)
    oidc_settings.oidc_native_redirect_uris = "securo://other"
    response = await client.get(f"/api/auth/oidc/callback?code=idp-code&state={state}", follow_redirects=False)
    assert response.status_code == 400
    assert not any(k.startswith("oidc_app_code:") for k in native_oidc.store)


@pytest.mark.asyncio
async def test_oidc_web_callback_still_requires_a_code(client: AsyncClient, clean_db, native_oidc):
    await native_oidc.set("oidc_state:web", json.dumps({"nonce": "n"}))
    response = await client.get("/api/auth/oidc/callback?error=access_denied&state=web", follow_redirects=False)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_oidc_web_flow_unchanged_when_native_flow_is_enabled(client: AsyncClient, clean_db, native_oidc):
    login = await client.get("/api/auth/oidc/login", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    assert "app_redirect" not in json.loads(native_oidc.store[f"oidc_state:{state}"])
    response = await client.get(f"/api/auth/oidc/callback?code=idp-code&state={state}", follow_redirects=False)
    assert response.headers["location"].startswith("http://test/auth/oidc/callback#access_token=")
