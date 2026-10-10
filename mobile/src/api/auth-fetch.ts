import type { SessionStore } from '@/auth/session'

/**
 * Requests whose 401 means "wrong credentials", not "token expired". Retrying
 * them after a refresh would be wrong, and they run before any token exists.
 */
const CREDENTIAL_PATHS = [
  '/api/auth/login',
  '/api/auth/2fa/verify',
  '/api/auth/refresh',
  '/api/auth/passkeys/authenticate/',
  '/api/auth/passkeys/2fa/',
  '/api/auth/oidc/exchange',
]

function isCredentialRequest(url: string): boolean {
  // Not `new URL(url).pathname`: React Native's URL has historically lacked it.
  const pathname = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '').split(/[?#]/)[0] ?? ''
  return CREDENTIAL_PATHS.some((path) => pathname.startsWith(path))
}

interface Options {
  session: Pick<SessionStore, 'getState' | 'refreshAccessToken'>
  language: () => string
  baseFetch?: (request: Request) => Promise<Response>
}

/**
 * The `fetch` the API client uses: adds the bearer token, the selected
 * workspace and the UI language to every request, and when an access token
 * has expired, refreshes it once and replays the request.
 */
export function createAuthFetch({ session, language, baseFetch = (r) => fetch(r) }: Options) {
  function withHeaders(request: Request): Request {
    const { accessToken, workspaceId } = session.getState()
    const headers = new Headers(request.headers)
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    if (workspaceId) headers.set('X-Workspace-Id', workspaceId)
    headers.set('Accept-Language', language())
    return new Request(request, { headers })
  }

  return async function authFetch(request: Request): Promise<Response> {
    // The body can only be read once; keep a copy for the replay.
    const replay = request.clone()
    const response = await baseFetch(withHeaders(request))

    if (response.status !== 401 || isCredentialRequest(request.url)) return response
    if (!session.getState().refreshToken) return response
    if (!(await session.refreshAccessToken())) return response

    return baseFetch(withHeaders(replay))
  }
}
