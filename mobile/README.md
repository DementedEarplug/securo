# Securo for Android

A React Native ([Expo](https://docs.expo.dev/)) app for Securo, against your
own Securo server. It covers what the web app does day to day: accounts,
transactions (including transfers, installments, recurring and split
transactions, and attachments), bank connections and sync, statement import,
categories, rules (including recategorizing a vendor's past and future
transactions in one step), payees, budgets, goals, reports, assets and investments,
invoices (business workspaces), the AI assistant (when the server enables it),
export and backup, admin settings, and sign-in with a password, TOTP, passkeys
or single sign-on. See [the RFC](../docs/rfc-mobile-android-client.md) for the
design.

## Requirements

- Node 22 and npm ≥ 11.10 (the `.npmrc` cooldown needs it; see
  [CONTRIBUTING](../CONTRIBUTING.md#adding-a-frontend-or-mobile-dependency))
- Android Studio, or the Android SDK with an emulator image / a phone with USB
  debugging
- JDK 17 or 21 for Gradle (Android Studio's bundled JDK works:
  `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` on macOS)
- A Securo server, e.g. `docker compose up` from the repo root

## Run it

```bash
cd mobile
npm ci
npm run android        # builds the debug app, installs it, starts Metro
```

`android/` is generated from `app.json` on the first run and is not committed;
delete it to regenerate after changing `app.json` or adding a native module.

In the app, enter the server address:

| Where the server runs | Address to enter |
|---|---|
| `docker compose up` on this computer, app in the emulator | `http://10.0.2.2:3000` (the emulator's name for the host) |
| A server on your network or the internet | the address you open in the browser, e.g. `https://securo.example.com` |

Plain `http://` only works in debug builds; a release build needs HTTPS.

### Single sign-on and passkeys

Both work only against a server on a domain name over HTTPS, so they can't be
tried against `10.0.2.2`.

- **Single sign-on** opens the server's identity provider in a browser tab and
  comes back on `securo://oidc`. The server must allow that address with
  `OIDC_NATIVE_REDIRECT_URIS=securo://oidc`; the button appears once it does.
- **Passkeys** use Android's Credential Manager. The server must trust the
  app's signing key (`WEBAUTHN_ANDROID_PACKAGE_NAME` and
  `WEBAUTHN_ANDROID_CERT_FINGERPRINTS`) so Android can verify
  `/.well-known/assetlinks.json`. For a debug build, the fingerprint is:

  ```bash
  keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey \
    -storepass android -keypass android | grep SHA256
  ```

## Checks

```bash
npm run lint
npm run typecheck
npm test
```

## API types

`src/api/openapi.json` is a snapshot of the backend's OpenAPI document and
`src/api/schema.d.ts` is generated from it, so `tsc` catches an API change that
breaks the app. After changing a backend route or schema:

```bash
cd backend && uv sync          # once
cd ../mobile && npm run api:types
```

and commit both files. CI fails when either is stale.

## Layout

```
app/                 screens (expo-router): (auth) sign-in, (app) everything after it
src/api/             typed client, auth-aware fetch, errors, generated schema
src/auth/            session store (tokens in the Android Keystore), sign-in flows
src/features/        data hooks and logic per area (accounts, transactions, assets, invoices, agents, ...)
src/components/      shared UI, including the SVG charts and icons
src/lib/format.ts    number/date formatting ported from the web app; keep them in step
src/i18n/            EN and PT-BR strings
```
