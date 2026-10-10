import createClient, { type Client } from 'openapi-fetch'

import { session } from '@/auth/session'
import i18n from '@/i18n'
import { createAuthFetch } from './auth-fetch'
import { ApiError, NetworkError } from './errors'
import type { paths } from './schema'

const authFetch = createAuthFetch({ session, language: () => i18n.language })

let cached: { baseUrl: string; client: Client<paths> } | null = null

/** The typed API client for the server the user signed in to. */
export function api(): Client<paths> {
  const { serverUrl } = session.getState()
  if (!serverUrl) throw new Error('No server configured')
  if (cached?.baseUrl !== serverUrl) {
    cached = { baseUrl: serverUrl, client: createClient<paths>({ baseUrl: serverUrl, fetch: authFetch }) }
  }
  return cached.client
}

/**
 * A raw authenticated request to `<server><path>` (path starts with `/api/`),
 * for responses the typed client can't express: file downloads and streams.
 * Throws `NetworkError` / `ApiError` like `unwrap`.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { serverUrl } = session.getState()
  if (!serverUrl) throw new Error('No server configured')
  let response: Response
  try {
    response = await authFetch(new Request(`${serverUrl}${path}`, init))
  } catch (error) {
    if (__DEV__) console.warn('[api] request failed before a response', error)
    throw new NetworkError(error)
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    throw await ApiError.from(response, body)
  }
  return response
}

type FetchResult<T> = { data?: T; error?: unknown; response: Response }

/**
 * Resolve an openapi-fetch call to its data, or throw an `ApiError`
 * (`RateLimitedError` on 429) / `NetworkError`, so React Query sees failures.
 */
export async function unwrap<T>(call: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>
  try {
    result = await call
  } catch (error) {
    // The UI shows a generic "can't reach the server"; keep the cause for debugging.
    if (__DEV__) console.warn('[api] request failed before a response', error)
    throw new NetworkError(error)
  }
  if (!result.response.ok) throw await ApiError.from(result.response, result.error)
  return result.data as T
}

/**
 * `unwrap` for the few endpoints the backend declares without a response model
 * (their schema says `unknown`). The caller states the shape it relies on.
 */
export function unwrapAs<T>(call: Promise<FetchResult<unknown>>): Promise<T> {
  return unwrap(call) as Promise<T>
}

/** `application/x-www-form-urlencoded` body, which the login endpoint expects. */
export function formBody(body: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null) params.append(key, String(value))
  }
  return params.toString()
}
