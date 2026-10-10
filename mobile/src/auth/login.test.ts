import { session } from '@/auth/session'
import { jsonResponse } from '@/test/render'
import { loginWithPassword, verifyTotp } from './login'

const fetchMock = jest.fn<Promise<Response>, [Request]>()

beforeEach(async () => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
  await session.signOut()
  await session.setServerUrl('https://s.example.com')
})

describe('loginWithPassword', () => {
  it('posts a form body asking for a refresh token, then stores both tokens', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' }),
    )

    await expect(loginWithPassword(' me@example.com ', 'pw&=1')).resolves.toEqual({ kind: 'signedIn' })

    const request = fetchMock.mock.calls[0]![0]
    expect(request.url).toBe('https://s.example.com/api/auth/login?remember=true')
    expect(request.headers.get('content-type')).toBe('application/x-www-form-urlencoded')
    expect(new URLSearchParams(await request.text()).get('password')).toBe('pw&=1')
    expect(session.getState()).toMatchObject({ status: 'signedIn', accessToken: 'a', refreshToken: 'r' })
  })

  it('returns the second-factor challenge without signing in', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ requires_2fa: true, temp_token: 'tmp', available_methods: ['totp', 'passkey'] }),
    )

    await expect(loginWithPassword('me@example.com', 'pw')).resolves.toEqual({
      kind: 'twoFactor',
      tempToken: 'tmp',
      methods: ['totp', 'passkey'],
    })
    expect(session.getState().status).toBe('signedOut')
  })

  it('surfaces wrong credentials without trying to refresh', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'LOGIN_BAD_CREDENTIALS' }, { status: 400 }))

    await expect(loginWithPassword('me@example.com', 'nope')).rejects.toMatchObject({
      status: 400,
      detail: 'LOGIN_BAD_CREDENTIALS',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a rate limit with its wait time', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '42' } }),
    )

    await expect(loginWithPassword('me@example.com', 'pw')).rejects.toMatchObject({ retryAfterSeconds: 42 })
  })
})

describe('verifyTotp', () => {
  it('completes sign-in with a refresh token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'a2', refresh_token: 'r2', token_type: 'bearer' }))

    await verifyTotp('tmp', '123456')

    const request = fetchMock.mock.calls[0]![0]
    expect(request.url).toBe('https://s.example.com/api/auth/2fa/verify?remember=true')
    expect(JSON.parse(await request.text())).toEqual({ temp_token: 'tmp', code: '123456' })
    expect(session.getState().refreshToken).toBe('r2')
  })
})
