import pytest
from httpx import AsyncClient

from app.core.config import get_settings

FINGERPRINT = ":".join(["AB"] * 32)


@pytest.fixture
def android_app():
    settings = get_settings()
    previous = (settings.webauthn_android_package_name, settings.webauthn_android_cert_fingerprints)
    settings.webauthn_android_package_name = "com.usesecuro.app"
    settings.webauthn_android_cert_fingerprints = "ab" * 32
    yield
    settings.webauthn_android_package_name, settings.webauthn_android_cert_fingerprints = previous


async def test_not_published_until_the_app_is_configured(client: AsyncClient):
    response = await client.get("/.well-known/assetlinks.json")

    assert response.status_code == 404


async def test_vouches_for_the_configured_app(client: AsyncClient, android_app):
    response = await client.get("/.well-known/assetlinks.json")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    [statement] = response.json()
    assert "delegate_permission/common.get_login_creds" in statement["relation"]
    assert statement["target"] == {
        "namespace": "android_app",
        "package_name": "com.usesecuro.app",
        "sha256_cert_fingerprints": [FINGERPRINT],
    }


async def test_needs_no_authentication(client: AsyncClient, android_app):
    # Google's verifier fetches it anonymously.
    response = await client.get("/.well-known/assetlinks.json", headers={"Authorization": "Bearer junk"})

    assert response.status_code == 200
