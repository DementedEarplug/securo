# RFC — Android app and long-lived sessions

Status: proposal · Issue: _to be opened_

## Problem

Securo is used on phones through the browser. The web UI is responsive, but it
is not an app: there is no launcher icon, no secure place to keep the session,
and the session ends every 24 hours because access tokens are the only
credential (`ACCESS_TOKEN_EXPIRE_MINUTES`, no refresh). A phone app built on the
current API would ask for the password every day, and there is no way for a
user to see or end the sessions their devices hold.

The everyday mobile jobs are small and frequent: check a balance, look up or
add a transaction while at the till, glance at a budget. They come first, but
a self-hoster on the go also links banks, imports a statement, fixes a rule or
issues an invoice, so the app grew to cover the web app's features (see Scope).

## Approach

Two parts, shipped as separate PRs so each can be reviewed on its own:

1. **Backend: revocable refresh tokens.** Opt-in per sign-in, so the web app's
   behaviour and payloads do not change at all.
2. **`mobile/`: a React Native (Expo) Android app** that talks to the existing
   API, generated from its OpenAPI document.

### Refresh tokens

- Every sign-in endpoint (`/auth/login`, `/auth/2fa/verify`,
  `/auth/passkeys/authenticate/verify`, `/auth/passkeys/2fa/verify`) accepts
  `?remember=true`. Only then does the response add `refresh_token` and
  `refresh_token_expires_at`; without it the payload is byte-for-byte what it
  was, which is what the web app keeps sending.
- The token is opaque (`secrets.token_urlsafe(48)`), not a JWT, so revoking it
  is deleting a row's usefulness rather than waiting for an expiry. Only its
  SHA-256 is stored.
- `POST /auth/refresh` **rotates** on every use. Rows from one sign-in share a
  `family_id`; presenting a token that was already rotated can only mean a copy
  exists, so the whole family is revoked (RFC 6819 §5.2.2.3 / OAuth 2.1
  refresh-token rotation). The client therefore refreshes single-flight.
- Lifetime `REFRESH_TOKEN_EXPIRE_DAYS` (default 30), restarted by each refresh,
  so an app in regular use stays signed in and an abandoned one expires.
- Revocation: `POST /auth/logout` with the token, `GET /auth/sessions` +
  `DELETE /auth/sessions/{id}` for the user's own devices, and **every** token
  of a user on password change (`PATCH /users/me`), reset, or an admin setting
  a new password. Deactivated users cannot refresh.
- `/auth/refresh` has its own rate limit (30/min) instead of sharing the 5/min
  sign-in budget, because the app refreshes in the background.
- Access tokens are unchanged (24h, stateless).

### The app

- **Expo + expo-router**, TypeScript, built locally (`npx expo run:android`),
  no hosted build service required. `android/` is generated from `app.json`
  and never committed.
- **Types come from the API, not by hand.** `mobile/src/api/openapi.json` is a
  committed snapshot of the backend's OpenAPI document, and
  `openapi-typescript` turns it into `schema.d.ts`; the typed `openapi-fetch`
  client means an API change that breaks the app breaks `tsc`. CI fails when
  the snapshot is stale (backend job) or the types don't match it (mobile job).
- **Credentials** live in the Android Keystore via `expo-secure-store`
  (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, `allowBackup` off).
- **Same numbers as the web.** `frontend/src/lib/format.ts` is ported as-is,
  and the app reads the admin number/date format settings, so `1.234,56`
  and `1,234.56` render (and parse, in the amount field) exactly as on the web.
- **Scope:** password, TOTP, passkey and single sign-on; workspace switching;
  accounts (create, edit, close); transactions with search, filters, add, edit,
  delete, CSV export and attachments, plus transfers, installments (with
  this/future/all scopes), recurring transactions and group splits; bank
  connections (SimpleFIN, Pluggy, Enable Banking) and sync; statement import
  (OFX, QIF, CAMT, CSV) with history and undo; categories, rules, payees;
  budgets and goals; reports; assets and investments (including order import);
  invoices with recurring agreements on business workspaces; the AI assistant
  and its management when `AGENTS_ENABLED`; export and backup; admin users and
  settings for superusers; signed-in devices.
- Viewers see no write actions (`READ_ONLY_ROLES`). A transfer leg can't change
  its type or account, since it must stay a debit/credit pair across two
  accounts; a split transaction resends its shares when its amount changes.
- i18n: EN and PT-BR in their own bundle, following the same rule as the web.
- No chart library: the charts are small SVG components. Icons come from
  `lucide-react-native` (the web uses `lucide-react`), imported per icon so
  only the ones used are bundled.

## Data model

One table, `refresh_tokens` (migration `097`):

| column | |
|---|---|
| `id`, `user_id` (FK, cascade) | |
| `token_hash` | SHA-256 hex, unique |
| `family_id` | one per sign-in; revoked together on reuse |
| `created_at`, `expires_at`, `last_used_at`, `revoked_at` | |
| `replaced_by_id` | set on rotation |
| `device_name`, `user_agent` | from `X-Device-Name` / `User-Agent`, for the devices list |

Rows are never needed after expiry; a user's expired rows are deleted on their
next refresh.

## OIDC sign-in for the app

The web flow ends with a redirect carrying the access token in a URL fragment
to `FRONTEND_URL`. An app can't catch that, and putting a long-lived token in a
redirect another app could claim would be unsafe. The app flow keeps the
provider side identical (same client, same callback URL) and only changes how
Securo hands the result back:

1. The app makes a PKCE verifier and opens
   `GET /api/auth/oidc/login?app_redirect=securo://oidc&app_code_challenge=<S256>`
   in a browser tab (`expo-web-browser` `openAuthSessionAsync`).
   `app_redirect` must exactly match an entry of the new
   `OIDC_NATIVE_REDIRECT_URIS` (empty by default: the app flow is off); only
   S256 is accepted. Both values are stored in the existing state record.
2. The callback runs every existing check (state, nonce, issuer, audience,
   email verification, linking and provisioning rules). For an app state it
   then stores a random one-time code in Redis (hashed, 60 s TTL) bound to the
   user and the challenge, and redirects to `securo://oidc?code=...`.
   Failures redirect with `error=` so the app can show them.
3. The app posts `{code, code_verifier}` to `POST /api/auth/oidc/exchange`
   (login rate limit). The code is consumed with `GETDEL` before the verifier
   is checked, so each code gets exactly one attempt; success returns the same
   response as `?remember=true` sign-ins (access + refresh token).

`GET /api/auth/oidc/config` gains `native_redirect_uris` so the app only shows
the SSO button when the server allows its redirect.

## Passkeys in the app

Android Credential Manager only offers a site's passkeys to an app the site
vouches for. The server publishes `/.well-known/assetlinks.json` for the app's
signing certificate and accepts its `android:apk-key-hash:` origin, both driven
by `WEBAUTHN_ANDROID_PACKAGE_NAME` / `WEBAUTHN_ANDROID_CERT_FINGERPRINTS`. The
app runs the ceremony with `react-native-passkey` against the existing
`/api/auth/passkeys/authenticate/*` and `/api/auth/passkeys/2fa/*` endpoints
(`?remember=true`), and sends `Origin: https://<server>` so the challenge is
bound to the server's domain rather than whatever `Host` a proxy forwards.

## Out of scope / follow-ups

- Push notifications (bill due, budget exceeded), offline cache, widgets, iOS.
- Distribution (Play Store / F-Droid / release signing) is a maintainer
  decision; the package name `com.usesecuro.app` is a placeholder until then.

## Open questions

1. Is 30 days the right default for `REFRESH_TOKEN_EXPIRE_DAYS`?
2. Should the web app also show (and revoke) signed-in devices, e.g. under
   Profile → Security? The API is there; the UI is not part of this proposal.
3. Package name and where the app is published.
