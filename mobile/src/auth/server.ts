/**
 * Turn what the user typed into a server origin: adds `https://` when no
 * scheme is given, and drops a trailing `/` or `/api` (people paste the API
 * URL as often as the app URL). Returns null when it is not a usable URL.
 */
export function normalizeServerUrl(input: string): string | null {
  let value = input.trim()
  if (!value) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`
  const match = /^(https?):\/\/([^/?#\s]+)(\/[^?#\s]*)?$/i.exec(value)
  if (!match) return null
  const [, scheme, host] = match
  const path = (match[3] ?? '').replace(/\/+$/, '').replace(/\/api$/i, '')
  return `${scheme!.toLowerCase()}://${host!.toLowerCase()}${path}`
}

/**
 * Where the server sends the browser back after single sign-on. The server
 * admin allow-lists it with `OIDC_NATIVE_REDIRECT_URIS=securo://oidc`.
 */
export const OIDC_APP_REDIRECT = 'securo://oidc'

/** What the server's `/api/auth/oidc/config` says about signing in from the app. */
export interface SignInOptions {
  localAuthEnabled: boolean
  /** Single sign-on the app can use, or null when the server hasn't allowed the app's redirect. */
  sso: { providerName: string } | null
}

export type ServerCheck = ({ ok: true } & SignInOptions) | { ok: false; reason: 'unreachable' | 'notSecuro' }

/** Read `/api/auth/oidc/config`; null when the body isn't Securo's. */
export function parseSignInOptions(body: unknown): SignInOptions | null {
  if (!body || typeof body !== 'object') return null
  const config = body as { enabled?: unknown; provider_name?: unknown; local_auth_enabled?: unknown; native_redirect_uris?: unknown }
  if (typeof config.local_auth_enabled !== 'boolean') return null
  const nativeRedirects = Array.isArray(config.native_redirect_uris) ? config.native_redirect_uris : []
  const ssoForApp = config.enabled === true && nativeRedirects.includes(OIDC_APP_REDIRECT)
  return {
    localAuthEnabled: config.local_auth_enabled,
    sso: ssoForApp
      ? { providerName: typeof config.provider_name === 'string' && config.provider_name ? config.provider_name : 'SSO' }
      : null,
  }
}

/**
 * Confirm a Securo API answers at `serverUrl` before saving it, and learn how
 * it lets people sign in (password, and single sign-on when it allows the app).
 */
export async function checkServer(
  serverUrl: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<ServerCheck> {
  let response: Response
  try {
    response = await fetchImpl(`${serverUrl}/api/auth/oidc/config`, {
      headers: { Accept: 'application/json' },
    })
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
  if (!response.ok) return { ok: false, reason: 'notSecuro' }
  try {
    const options = parseSignInOptions(await response.json())
    return options ? { ok: true, ...options } : { ok: false, reason: 'notSecuro' }
  } catch {
    return { ok: false, reason: 'notSecuro' }
  }
}
