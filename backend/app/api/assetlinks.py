"""Digital Asset Links statement for the Android app.

Android only lets an app use a website's passkeys (and open its links) when
the site publishes, at this exact path, which app package and signing
certificates it trusts. The values come from the same settings that add the
app's origin to passkey verification, so one configuration covers both.

https://developer.android.com/training/app-links/verify-android-applinks
"""

from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.core.webauthn import android_cert_fingerprints

router = APIRouter()


@router.get("/.well-known/assetlinks.json", include_in_schema=False)
async def assetlinks() -> list[dict]:
    package_name = get_settings().webauthn_android_package_name.strip()
    fingerprints = android_cert_fingerprints()
    if not package_name or not fingerprints:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not configured")
    return [
        {
            "relation": [
                "delegate_permission/common.get_login_creds",
                "delegate_permission/common.handle_all_urls",
            ],
            "target": {
                "namespace": "android_app",
                "package_name": package_name,
                "sha256_cert_fingerprints": fingerprints,
            },
        }
    ]
