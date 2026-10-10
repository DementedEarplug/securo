import { createHash, randomBytes } from 'crypto'

import { session } from '@/auth/session'
import { jsonResponse } from '@/test/render'
import { bytesToBase64Url, toBase64Url } from './base64url'
import { createPkce, isOidcReturn, loginWithOidc, OidcError, oidcLoginUrl, parseOidcReturn } from './oidc'

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }))
jest.mock('expo-crypto', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto') as typeof import('crypto')
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { BASE64: 'base64' },
    getRandomBytes: (count: number) => new Uint8Array(nodeCrypto.randomBytes(count)),
    digestStringAsync: async (_algorithm: string, value: string) =>
      nodeCrypto.createHash('sha256').update(value).digest('base64'),
  }
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebBrowser = require('expo-web-browser') as { openAuthSessionAsync: jest.Mock }

const nodeDeps = {
  randomBytes: (count: number) => new Uint8Array(randomBytes(count)),
  sha256Base64: async (value: string) => createHash('sha256').update(value).digest('base64'),
}

describe('base64url', () => {
  it('encodes without padding in the URL-safe alphabet', () => {
    expect(bytesToBase64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8')
    expect(bytesToBase64Url(new Uint8Array([1, 2, 3]))).toBe('AQID')
    expect(toBase64Url('a+b/c==')).toBe('a-b_c')
  })
})

describe('createPkce', () => {
  it('matches the RFC 7636 example', async () => {
    const verifierBytes = new Uint8Array([
      116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240,
      91, 88, 5, 88, 83, 132, 141, 121,
    ])
    const pkce = await createPkce({ ...nodeDeps, randomBytes: () => verifierBytes })
    expect(pkce).toEqual({
      verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    })
  })

  it('makes a 43-character verifier and a fresh pair each time', async () => {
    const a = await createPkce(nodeDeps)
    const b = await createPkce(nodeDeps)
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a.verifier).not.toBe(b.verifier)
  })
})

describe('oidcLoginUrl', () => {
  it('asks the server for an app sign-in returning to securo://oidc', () => {
    const url = new URL(oidcLoginUrl('https://s.example.com/securo', 'abc'))
    expect(`${url.origin}${url.pathname}`).toBe('https://s.example.com/securo/api/auth/oidc/login')
    expect(url.searchParams.get('app_redirect')).toBe('securo://oidc')
    expect(url.searchParams.get('app_code_challenge')).toBe('abc')
  })
})

describe('parseOidcReturn', () => {
  it.each([
    ['securo://oidc?code=xyz', { kind: 'code', code: 'xyz' }],
    ['securo://oidc/?code=a%2Bb', { kind: 'code', code: 'a+b' }],
    ['securo://oidc?error=access_denied', { kind: 'error', error: 'access_denied', description: null }],
    [
      'securo://oidc?error=access_denied&error_description=OIDC+email+is+not+verified',
      { kind: 'error', error: 'access_denied', description: 'OIDC email is not verified' },
    ],
    ['securo://oidc', { kind: 'invalid' }],
    ['securo://oidcx?code=1', { kind: 'invalid' }],
    ['https://evil.example.com/securo://oidc?code=1', { kind: 'invalid' }],
  ])('%s', (url, expected) => {
    expect(parseOidcReturn(url)).toEqual(expected)
  })
})

describe('isOidcReturn', () => {
  it.each(['securo://oidc?code=1', '/oidc?code=1', 'oidc', 'securo://oidc'])('recognizes %s', (path) => {
    expect(isOidcReturn(path)).toBe(true)
  })
  it.each(['/', '/oidcx', 'securo://account/1', '/settings'])('ignores %s', (path) => {
    expect(isOidcReturn(path)).toBe(false)
  })
})

describe('loginWithOidc', () => {
  const fetchMock = jest.fn<Promise<Response>, [Request]>()

  beforeEach(async () => {
    fetchMock.mockReset()
    WebBrowser.openAuthSessionAsync.mockReset()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    await session.signOut()
    await session.setServerUrl('https://s.example.com')
  })

  it('trades the returned code and its verifier for a session', async () => {
    WebBrowser.openAuthSessionAsync.mockResolvedValueOnce({ type: 'success', url: 'securo://oidc?code=one-time' })
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' }))

    await expect(loginWithOidc('https://s.example.com')).resolves.toBe('signedIn')

    const [loginUrl, redirect] = WebBrowser.openAuthSessionAsync.mock.calls[0] as [string, string]
    expect(redirect).toBe('securo://oidc')
    const challenge = new URL(loginUrl).searchParams.get('app_code_challenge')

    const request = fetchMock.mock.calls[0]![0]
    expect(request.url).toBe('https://s.example.com/api/auth/oidc/exchange')
    const body = (await request.json()) as { code: string; code_verifier: string }
    expect(body.code).toBe('one-time')
    expect(toBase64Url(createHash('sha256').update(body.code_verifier).digest('base64'))).toBe(challenge)
    expect(session.getState()).toMatchObject({ status: 'signedIn', accessToken: 'a', refreshToken: 'r' })
  })

  it('treats closing the browser as a cancel, without calling the server', async () => {
    WebBrowser.openAuthSessionAsync.mockResolvedValueOnce({ type: 'cancel' })
    await expect(loginWithOidc('https://s.example.com')).resolves.toBe('cancelled')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports the server-side reason when sign-in was refused', async () => {
    WebBrowser.openAuthSessionAsync.mockResolvedValueOnce({
      type: 'success',
      url: 'securo://oidc?error=access_denied&error_description=Registration+is+disabled',
    })
    const failure = loginWithOidc('https://s.example.com')
    await expect(failure).rejects.toBeInstanceOf(OidcError)
    await expect(failure).rejects.toMatchObject({ description: 'Registration is disabled' })
    expect(session.getState().status).toBe('signedOut')
  })
})
