export type OAuthReturn =
  | { kind: 'code'; code: string; state: string | null }
  | { kind: 'error'; error: string; description: string | null }

// Enable Banking sends the browser to `{FRONTEND_URL}/oauth/callback` (or the
// older `/enable-banking` route) when the user finishes at their bank.
const CALLBACK_PATHS = ['/oauth/callback', '/enable-banking']

function queryParams(url: string): Map<string, string> {
  const params = new Map<string, string>()
  const query = url.split('#')[0]?.split('?')[1] ?? ''
  for (const pair of query.split('&')) {
    if (!pair) continue
    const [key, value = ''] = pair.split('=')
    try {
      params.set(decodeURIComponent(key!), decodeURIComponent(value.replace(/\+/g, ' ')))
    } catch {
      params.set(key!, value)
    }
  }
  return params
}

/**
 * Recognise the redirect that ends a bank-consent flow, so the app can finish
 * the link itself instead of loading the web app's callback page. Returns null
 * for every other page the bank shows on the way.
 */
export function parseOAuthReturn(url: string): OAuthReturn | null {
  const path = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '').split(/[?#]/)[0]?.replace(/\/+$/, '') ?? ''
  if (!CALLBACK_PATHS.some((callback) => path === callback || path.endsWith(callback))) return null
  const params = queryParams(url)
  const error = params.get('error')
  if (error) return { kind: 'error', error, description: params.get('error_description') ?? null }
  const code = params.get('code')
  if (!code) return null
  return { kind: 'code', code, state: params.get('state') ?? null }
}
