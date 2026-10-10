import * as Crypto from 'expo-crypto'
import * as WebBrowser from 'expo-web-browser'

import { api, unwrap } from '@/api/client'
import type { TokenResponse } from '@/api/types'
import { bytesToBase64Url, toBase64Url } from './base64url'
import { OIDC_APP_REDIRECT } from './server'
import { deviceName, session } from './session'

export { OIDC_APP_REDIRECT }
export { isOidcReturn } from './oidc-return'

export interface Pkce {
  verifier: string
  challenge: string
}

interface PkceDeps {
  randomBytes: (count: number) => Uint8Array
  /** SHA-256 of a string, as standard base64. */
  sha256Base64: (value: string) => Promise<string>
}

const expoCrypto: PkceDeps = {
  randomBytes: (count) => Crypto.getRandomBytes(count),
  sha256Base64: (value) =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, { encoding: Crypto.CryptoEncoding.BASE64 }),
}

/** A fresh PKCE pair (RFC 7636, S256): 32 random bytes → a 43-character verifier. */
export async function createPkce(deps: PkceDeps = expoCrypto): Promise<Pkce> {
  const verifier = bytesToBase64Url(deps.randomBytes(32))
  const challenge = toBase64Url(await deps.sha256Base64(verifier))
  return { verifier, challenge }
}

/** The server URL that starts SSO for the app; it redirects to the provider. */
export function oidcLoginUrl(serverUrl: string, challenge: string): string {
  const query = new URLSearchParams({ app_redirect: OIDC_APP_REDIRECT, app_code_challenge: challenge })
  return `${serverUrl}/api/auth/oidc/login?${query.toString()}`
}

export type OidcReturn =
  | { kind: 'code'; code: string }
  | { kind: 'error'; error: string; description: string | null }
  | { kind: 'invalid' }

/** Read the server's answer from the redirect: a one-time code or an error. */
export function parseOidcReturn(url: string): OidcReturn {
  if (!url.toLowerCase().startsWith(OIDC_APP_REDIRECT)) return { kind: 'invalid' }
  const rest = url.slice(OIDC_APP_REDIRECT.length)
  if (rest && !/^\/?[?#]/.test(rest)) return { kind: 'invalid' }
  const queryStart = rest.search(/[?#]/)
  const params = new URLSearchParams(queryStart === -1 ? '' : rest.slice(queryStart + 1))
  const code = params.get('code')
  if (code) return { kind: 'code', code }
  const error = params.get('error')
  if (error) return { kind: 'error', error, description: params.get('error_description') }
  return { kind: 'invalid' }
}

/** SSO failed at the provider or at Securo; `description` is the server's reason when it sent one. */
export class OidcError extends Error {
  constructor(
    readonly error: string,
    readonly description: string | null,
  ) {
    super(description ?? error)
    this.name = 'OidcError'
  }
}

export type OidcOutcome = 'signedIn' | 'cancelled'

/**
 * Sign in through the server's identity provider in a browser tab. The server
 * returns a one-time code, worth nothing without this sign-in's PKCE verifier,
 * which the app trades for a session like a password sign-in.
 */
export async function loginWithOidc(serverUrl: string): Promise<OidcOutcome> {
  const pkce = await createPkce()
  const result = await WebBrowser.openAuthSessionAsync(oidcLoginUrl(serverUrl, pkce.challenge), OIDC_APP_REDIRECT)
  if (result.type !== 'success') return 'cancelled'

  const returned = parseOidcReturn(result.url)
  if (returned.kind === 'error') throw new OidcError(returned.error, returned.description)
  if (returned.kind === 'invalid') throw new OidcError('invalid_response', null)

  const tokens = await unwrap<TokenResponse>(
    api().POST('/api/auth/oidc/exchange', {
      body: { code: returned.code, code_verifier: pkce.verifier },
      headers: { 'X-Device-Name': deviceName() },
    }),
  )
  await session.signIn(tokens)
  return 'signedIn'
}
