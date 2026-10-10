from pathlib import Path
from pydantic import SecretStr, ValidationError
import pytest

from app.core.config import Settings


def write(dir: Path, name: str, value: str) -> None:
    (dir / name).write_text(value)


@pytest.fixture
def secrets(tmp_path: Path):
    d = tmp_path / "secrets"
    d.mkdir()
    return d


def test_env_file_is_anchored_to_backend_dir():
    """The worker/beat must resolve the same .env as the API regardless of the
    working directory each service is launched from."""
    env_files = Settings.model_config["env_file"]
    backend_env = Path(__file__).resolve().parents[1] / ".env"
    assert isinstance(env_files, tuple)
    assert backend_env in tuple(Path(p) for p in env_files)


def test_env_file_with_unknown_keys_still_loads(tmp_path: Path, secrets: Path, monkeypatch):
    """The .env is shared with Docker Compose and the optional modules, so it
    holds keys Settings doesn't declare (COMPOSE_PROFILES, FRONTEND_PORT,
    AGENTS_*). Unknown keys must be ignored, not abort startup."""
    monkeypatch.delenv("SECRET_KEY")
    env_file = tmp_path / ".env"
    env_file.write_text(
        "SECRET_KEY=from-env-file\n"
        "AGENTS_ENABLED=true\n"
        "COMPOSE_PROFILES=agents\n"
        "FRONTEND_PORT=3132\n"
    )

    settings = Settings(_env_file=str(env_file), _secrets_dir=str(secrets))

    assert settings.secret_key.get_secret_value() == "from-env-file"


def test_agent_settings_env_file_is_anchored_to_backend_dir():
    """Agents settings must resolve the same .env as the main Settings, so a
    worker started outside backend/ doesn't silently fall back to defaults."""
    from app.agents.config import AgentSettings

    env_files = AgentSettings.model_config["env_file"]
    backend_env = Path(__file__).resolve().parents[1] / ".env"
    assert isinstance(env_files, tuple)
    assert backend_env in tuple(Path(p) for p in env_files)


def test_oidc_secret_reads_from_secrets_dir(secrets: Path):
    write(secrets, "oidc_client_secret", "file-secret")

    settings = Settings(_secrets_dir=str(secrets))
    assert settings.oidc_client_secret.get_secret_value() == "file-secret"


def test_oidc_secret_strips_whitespace(secrets: Path):
    write(secrets, "oidc_client_secret", "  stripped-value  \n\n")

    settings = Settings(_secrets_dir=str(secrets))
    assert settings.oidc_client_secret.get_secret_value() == "stripped-value"


def test_oidc_secret_inline_when_no_file(secrets: Path):
    settings = Settings(
        oidc_client_secret="inline-secret",
        _secrets_dir=str(secrets),
    )

    assert settings.oidc_client_secret.get_secret_value() == "inline-secret"


def test_oidc_secret_default_when_no_file(secrets: Path):
    settings = Settings(_secrets_dir=str(secrets))

    assert settings.oidc_client_secret.get_secret_value() == ""


def test_multiple_secrets_dirs_merge(tmp_path: Path):
    d1, d2 = tmp_path / "d1", tmp_path / "d2"
    d1.mkdir()
    d2.mkdir()

    secrets = {
        d1: {
            "oidc_client_secret": "from-d1",
            "oidc_provider_name": "Provider D1",
        },
        d2: {
            "oidc_client_secret": "from-d2",
            "oidc_client_id": "from-d2",
        },
    }
    for directory, values in secrets.items():
        for name, value in values.items():
            write(directory, name, value)

    expectedSecrets = {**secrets[d1], **secrets[d2]}
    settings = Settings(_secrets_dir=[str(d1), str(d2)])

    for key, expectedValue in expectedSecrets.items():
        value = getattr(settings, key)
        if isinstance(value, SecretStr):
            value = value.get_secret_value()

        assert value == expectedValue


def test_refresh_token_lifetime_defaults_to_30_days(secrets: Path):
    settings = Settings(_secrets_dir=str(secrets))

    assert settings.refresh_token_expire_days == 30


def test_refresh_token_lifetime_reads_env(secrets: Path, monkeypatch):
    monkeypatch.setenv("REFRESH_TOKEN_EXPIRE_DAYS", "90")

    assert Settings(_secrets_dir=str(secrets)).refresh_token_expire_days == 90


def test_android_fingerprints_are_normalized(secrets: Path, monkeypatch):
    monkeypatch.setenv("WEBAUTHN_ANDROID_PACKAGE_NAME", "com.usesecuro.app")
    monkeypatch.setenv("WEBAUTHN_ANDROID_CERT_FINGERPRINTS", " " + "ab" * 32 + " , " + ":".join(["CD"] * 32))

    from app.core.config import parse_cert_fingerprints

    settings = Settings(_secrets_dir=str(secrets))
    assert parse_cert_fingerprints(settings.webauthn_android_cert_fingerprints) == [
        ":".join(["AB"] * 32),
        ":".join(["CD"] * 32),
    ]


def test_android_fingerprint_must_be_sha256(secrets: Path, monkeypatch):
    monkeypatch.setenv("WEBAUTHN_ANDROID_PACKAGE_NAME", "com.usesecuro.app")
    monkeypatch.setenv("WEBAUTHN_ANDROID_CERT_FINGERPRINTS", "AB:CD")

    with pytest.raises(ValueError, match="WEBAUTHN_ANDROID_CERT_FINGERPRINTS"):
        Settings(_secrets_dir=str(secrets))


@pytest.mark.parametrize(
    "env",
    [
        {"WEBAUTHN_ANDROID_PACKAGE_NAME": "com.usesecuro.app"},
        {"WEBAUTHN_ANDROID_CERT_FINGERPRINTS": "ab" * 32},
    ],
)
def test_android_passkey_settings_go_together(secrets: Path, monkeypatch, env):
    for key, value in env.items():
        monkeypatch.setenv(key, value)

    with pytest.raises(ValueError, match="set both or neither"):
        Settings(_secrets_dir=str(secrets))


def test_local_auth_enabled_defaults_true(secrets: Path):
    settings = Settings(_secrets_dir=str(secrets))

    assert settings.local_auth_enabled is True


def test_local_auth_can_be_disabled_when_oidc_is_enabled(secrets: Path):
    settings = Settings(
        oidc_enabled=True,
        oidc_client_id="securo",
        oidc_discovery_url="https://id.example.com/.well-known/openid-configuration",
        local_auth_enabled=False,
        _secrets_dir=str(secrets),
    )

    assert settings.local_auth_enabled is False


def test_local_auth_disabled_requires_oidc(secrets: Path):
    with pytest.raises(ValidationError, match="LOCAL_AUTH_ENABLED=false requires a complete OIDC configuration"):
        Settings(local_auth_enabled=False, _secrets_dir=str(secrets))


@pytest.mark.parametrize(
    ("missing_field", "oidc_client_id", "oidc_discovery_url"),
    [
        (
            "OIDC_CLIENT_ID",
            "",
            "https://id.example.com/.well-known/openid-configuration",
        ),
        ("OIDC_DISCOVERY_URL", "securo", ""),
    ],
)
def test_local_auth_disabled_requires_complete_oidc_configuration(
    secrets: Path,
    missing_field: str,
    oidc_client_id: str,
    oidc_discovery_url: str,
):
    with pytest.raises(ValidationError, match=missing_field):
        Settings(
            oidc_enabled=True,
            oidc_client_id=oidc_client_id,
            oidc_discovery_url=oidc_discovery_url,
            local_auth_enabled=False,
            _secrets_dir=str(secrets),
        )


def test_oidc_native_redirect_uris_parse_and_validate():
    from app.core.config import Settings, parse_native_redirect_uris

    assert parse_native_redirect_uris("") == []
    assert parse_native_redirect_uris(" securo://oidc , com.example.app:/oauth ") == ["securo://oidc", "com.example.app:/oauth"]
    for bad in ("not a uri", "securo://oidc#frag", "javascript:alert(1)", "://x", "1abc://x"):
        with pytest.raises(ValueError):
            parse_native_redirect_uris(bad)
    with pytest.raises(ValueError, match="OIDC_NATIVE_REDIRECT_URIS"):
        Settings(oidc_native_redirect_uris="securo://oidc#x")
    assert Settings().oidc_native_redirect_uri_list == []
