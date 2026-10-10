from functools import lru_cache
from os import getenv
from pathlib import Path

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Use the same environment variable that systemd uses: https://systemd.io/CREDENTIALS/
# If not defined, defaults to docker secrets defaults (https://docs.docker.com/compose/how-tos/use-secrets/)
CREDENTIALS_DIRECTORY: list[Path] = [
    Path(p) for p in getenv("CREDENTIALS_DIRECTORY", "/run/secrets").split(":") if p
]


def parse_cert_fingerprints(raw: str) -> list[str]:
    """SHA-256 certificate fingerprints, comma-separated, normalized to AA:BB:...

    Accepts the colon-separated form `keytool -list -v` prints, or bare hex.
    """
    fingerprints = []
    for item in raw.split(","):
        hex_digits = item.strip().replace(":", "").upper()
        if not hex_digits:
            continue
        if len(hex_digits) != 64 or any(c not in "0123456789ABCDEF" for c in hex_digits):
            raise ValueError(f"not a SHA-256 certificate fingerprint: {item.strip()!r}")
        fingerprints.append(":".join(hex_digits[i : i + 2] for i in range(0, 64, 2)))
    return fingerprints


_URI_SCHEME_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789+.-"


def parse_native_redirect_uris(raw: str) -> list[str]:
    """Exact redirect URIs a native app may ask the OIDC callback to return to.

    Comma-separated. Each must be an absolute URI (`securo://oidc`); fragments
    and whitespace are rejected because the code is appended as a query string.
    """
    uris = []
    for item in raw.split(","):
        uri = item.strip()
        if not uri:
            continue
        scheme, sep, rest = uri.partition(":")
        if (
            not sep
            or not rest
            or not scheme
            or not scheme[0].isalpha()
            or any(c not in _URI_SCHEME_CHARS for c in scheme.lower())
            or "#" in uri
            or any(c.isspace() for c in uri)
        ):
            raise ValueError(f"not an absolute redirect URI without a fragment: {uri!r}")
        if scheme.lower() in {"javascript", "data", "file", "vbscript"}:
            raise ValueError(f"unsafe redirect URI scheme: {uri!r}")
        uris.append(uri)
    return uris


class Settings(BaseSettings):
    # App
    app_name: str = "Securo"
    debug: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/securo"

    # Auth
    secret_key: SecretStr = SecretStr("change-me-in-production")
    local_auth_enabled: bool = True
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 24 hours
    # Lifetime of the refresh tokens issued to clients that ask to stay signed
    # in (the mobile app). Each refresh rotates the token and restarts the clock.
    refresh_token_expire_days: int = 30

    # Pluggy
    pluggy_client_id: str = ""
    pluggy_client_secret: SecretStr = SecretStr("")
    # Empty means "derive from FRONTEND_URL" (see BankProvider.redirect_uri).
    # Set explicitly only when the URL registered in the provider dashboard
    # differs from where the app is served.
    pluggy_oauth_redirect_uri: str = ""
    # Gates the BrasilAPI outbound lookup in _lookup_bank_info (pluggy.py).
    # Off by default: no third-party call happens until a deploy opts in.
    brasilapi_institution_lookup_enabled: bool = False

    # Enable Banking (European PSD2 banks)
    enable_banking_app_id: str = ""
    enable_banking_private_key: SecretStr = SecretStr("")  # raw PEM; supports \n-escaped envs
    enable_banking_private_key_file: str = ""  # path to PEM file; takes precedence
    enable_banking_api_url: str = "https://api.enablebanking.com"
    enable_banking_oauth_redirect_uri: str = ""  # empty derives from FRONTEND_URL

    # SimpleFIN Bridge (US/intl banks, paste-a-token flow). Off by default.
    # The bridge URL defaults to the beta/sandbox host so users can test with
    # the demo token; flip to https://bridge.simplefin.org for production.
    simplefin_enabled: bool = False
    simplefin_api_url: str = "https://beta-bridge.simplefin.org"

    # Frontend
    frontend_url: str = "http://localhost:5173"

    # WebAuthn / passkeys
    webauthn_rp_name: str = "Securo"
    # Empty means the RP ID follows the domain the browser is on, which is what
    # most deployments want. Set it to pin passkeys to one domain (e.g.
    # securo.example.com); requests from other origins are then rejected.
    webauthn_rp_id: str = ""
    # Empty means the expected origin follows the browser. Only set this when the
    # app is reached at exactly one origin and you want it enforced.
    webauthn_origin: str = ""
    webauthn_challenge_ttl_seconds: int = 300
    # The Android app. Credential Manager signs passkey ceremonies with an
    # `android:apk-key-hash:` origin derived from the app's signing certificate,
    # and only offers the site's passkeys when this server vouches for the app
    # in /.well-known/assetlinks.json. Both come from these two settings; empty
    # means the app cannot use passkeys here. Fingerprints are the SHA-256 lines
    # `keytool -list -v` prints (AA:BB:...), comma-separated for several builds.
    webauthn_android_package_name: str = ""
    webauthn_android_cert_fingerprints: str = ""

    # Defaults
    default_currency: str = "USD"  # fallback currency when user preference is unavailable

    # FX Rates
    openexchangerates_app_id: str = ""
    supported_currencies: str = "USD,EUR,GBP,BRL,CAD,AUD,CHF,ARS,JPY,MXN,INR,SEK,DKK,NOK,PLN,CZK,HUF,RON,CRC,IDR,COP,CLP,DOP,KZT,RUB,GTQ,PHP,UAH,NZD,VND,SGD,AZN,TRY,PKR,MDL,AED,THB,EGP,MYR,CNY,SAR,QAR,JMD,RSD"  # comma-separated list
    fx_sync_mode: str = "on_demand"  # "on_demand" or "scheduled"

    # Storage
    storage_provider: str = "local"  # "local" or "s3"
    storage_local_path: str = "./data/attachments"
    storage_max_file_size_mb: int = 10
    storage_allowed_extensions: str = "jpg,jpeg,png,webp,gif,heic,pdf"
    storage_max_attachments_per_transaction: int = 10
    # An invoice gathers more paper than a transaction does: the bill, the
    # fiscal document, a receipt, the contract behind it, and a correction
    # of any of them.
    storage_max_attachments_per_invoice: int = 20

    # S3 Storage (for future use)
    storage_s3_bucket: str = ""
    storage_s3_region: str = ""
    storage_s3_access_key: SecretStr = SecretStr("")
    storage_s3_secret_key: SecretStr = SecretStr("")
    storage_s3_endpoint_url: str = ""  # for S3-compatible services (MinIO, DigitalOcean Spaces)

    # Registration
    registration_enabled: bool = True

    # OIDC login (works with Authentik, Pocket ID, and other standard OIDC providers)
    oidc_enabled: bool = False
    oidc_provider_name: str = "OIDC"
    oidc_discovery_url: str = (
        ""  # e.g. https://auth.example.com/application/o/securo/.well-known/openid-configuration
    )
    oidc_client_id: str = ""
    oidc_client_secret: SecretStr = SecretStr("")
    oidc_redirect_uri: str = ""  # defaults to {FRONTEND_URL}/api/auth/oidc/callback
    oidc_scopes: str = "openid email profile"
    oidc_auto_register: bool = True
    oidc_existing_user_link_mode: str = "disabled"  # disabled|verified_email|email
    oidc_require_verified_email: bool = True
    oidc_sync_roles: bool = False
    oidc_roles_claim: str = "groups"
    oidc_admin_roles: str = ""  # comma-separated provider roles/groups that grant Securo admin
    oidc_workspace_role_map: str = ""  # JSON: {"provider-role": "owner|editor|viewer"}
    # Native apps (the Android client) sign in through the system browser and
    # come back on one of these exact URIs with a one-time code. Empty = off.
    oidc_native_redirect_uris: str = ""  # e.g. securo://oidc

    # Celery
    redis_url: str = "redis://localhost:6379/0"

    # Reverse-proxy trust for client-IP-based rate limiting. 0 (default) means
    # request.client.host is used as-is, which is only correct when nothing
    # sits between the client and this service. In the shipped docker-compose
    # topology the backend is reached through the bundled nginx frontend, so
    # request.client.host is always nginx's container address. Set this to the
    # number of trusted reverse proxies in front of the backend (usually 1) to
    # derive the client IP from X-Forwarded-For instead, trusting only that
    # many hops from the right; a chain shorter than expected is not trusted.
    trusted_proxy_hops: int = 0

    # Logo size for market-priced asset icons. The logo URL is built from
    # the company website we get from the market-price provider; no API
    # key or third-party account is required. Defaults to 128×128 which
    # is what Google's favicon service caps at before upscaling.
    logo_size: int = 128

    # Brazilian Treasury bond prices (official Tesouro Transparente CSV).
    # On by default since most users are Brazilian; the official CSV is only
    # fetched when someone actually searches a bond, and the UI pre-warm is
    # gated to Brazilian users, so non-Brazilian installs pay ~zero cost.
    # Set TESOURO_DIRETO_ENABLED=false to fully disable (e.g. to avoid the
    # external dependency on the Brazilian government endpoint).
    tesouro_direto_enabled: bool = True

    @property
    def oidc_login_available(self) -> bool:
        return bool(self.oidc_enabled and self.oidc_client_id and self.oidc_discovery_url)

    @property
    def oidc_native_redirect_uri_list(self) -> list[str]:
        return parse_native_redirect_uris(self.oidc_native_redirect_uris)

    @model_validator(mode="after")
    def validate_oidc_native_redirect_uris(self) -> "Settings":
        try:
            parse_native_redirect_uris(self.oidc_native_redirect_uris)
        except ValueError as exc:
            raise ValueError(f"OIDC_NATIVE_REDIRECT_URIS: {exc}") from None
        return self

    @model_validator(mode="after")
    def validate_auth_settings(self) -> "Settings":
        if not self.local_auth_enabled and not self.oidc_login_available:
            missing = []
            if not self.oidc_enabled:
                missing.append("OIDC_ENABLED=true")
            if not self.oidc_client_id:
                missing.append("OIDC_CLIENT_ID")
            if not self.oidc_discovery_url:
                missing.append("OIDC_DISCOVERY_URL")
            raise ValueError(
                "LOCAL_AUTH_ENABLED=false requires a complete OIDC configuration; "
                f"missing: {', '.join(missing)}"
            )
        return self

    @model_validator(mode="after")
    def validate_android_passkeys(self) -> "Settings":
        try:
            fingerprints = parse_cert_fingerprints(self.webauthn_android_cert_fingerprints)
        except ValueError as exc:
            raise ValueError(f"WEBAUTHN_ANDROID_CERT_FINGERPRINTS: {exc}") from None
        if bool(fingerprints) != bool(self.webauthn_android_package_name.strip()):
            raise ValueError(
                "WEBAUTHN_ANDROID_PACKAGE_NAME and WEBAUTHN_ANDROID_CERT_FINGERPRINTS "
                "are only useful together; set both or neither"
            )
        return self

    # The CWD-relative ".env" is kept for backward compatibility; the anchored
    # backend/.env guarantees the API and the Celery worker/beat resolve the
    # same file no matter which working directory each service is launched
    # from (a systemd unit without WorkingDirectory= used to leave the worker
    # with default settings, silently disabling every bank-sync provider).
    #
    # extra="ignore" because the same .env is shared with Docker Compose and with
    # the optional modules: it legitimately holds keys this model doesn't declare
    # (COMPOSE_PROFILES, FRONTEND_PORT, AGENTS_*, ...). Unknown keys coming from
    # the process environment are ignored by pydantic-settings anyway; without
    # this, the very same key written into the .env file aborted startup with
    # "Extra inputs are not permitted".
    model_config = SettingsConfigDict(
        env_file=(".env", Path(__file__).resolve().parents[2] / ".env"),
        secrets_dir=CREDENTIALS_DIRECTORY,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
