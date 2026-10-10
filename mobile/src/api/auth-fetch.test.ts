import { jsonResponse } from '@/test/render'
import { createAuthFetch } from './auth-fetch'

function fakeSession(initial: { accessToken?: string | null; refreshToken?: string | null; workspaceId?: string | null }) {
  const state = { accessToken: 'old', refreshToken: 'refresh', workspaceId: null, ...initial }
  return {
    state,
    getState: () => state as never,
    refreshAccessToken: jest.fn(async () => {
      state.accessToken = 'new'
      return true
    }),
  }
}

const URL_ME = 'https://s.example.com/api/users/me'

describe('authFetch', () => {
  it('sends the token, workspace and language', async () => {
    const baseFetch = jest.fn(async (_request: Request) => jsonResponse({}))
    const session = fakeSession({ workspaceId: 'ws-1' })
    const authFetch = createAuthFetch({ session, language: () => 'pt-BR', baseFetch })

    await authFetch(new Request(URL_ME))

    const sent = baseFetch.mock.calls[0]![0]
    expect(sent.headers.get('authorization')).toBe('Bearer old')
    expect(sent.headers.get('x-workspace-id')).toBe('ws-1')
    expect(sent.headers.get('accept-language')).toBe('pt-BR')
  })

  it('refreshes an expired token once and replays the request with its body', async () => {
    const baseFetch = jest
      .fn<Promise<Response>, [Request]>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'tx' }))
    const session = fakeSession({})
    const authFetch = createAuthFetch({ session, language: () => 'en', baseFetch })

    const response = await authFetch(
      new Request('https://s.example.com/api/transactions', { method: 'POST', body: '{"description":"Coffee"}' }),
    )

    expect(response.status).toBe(200)
    expect(session.refreshAccessToken).toHaveBeenCalledTimes(1)
    const replay = baseFetch.mock.calls[1]![0]
    expect(replay.headers.get('authorization')).toBe('Bearer new')
    await expect(replay.text()).resolves.toBe('{"description":"Coffee"}')
  })

  it('returns the 401 when the session cannot be refreshed', async () => {
    const baseFetch = jest.fn(async () => new Response(null, { status: 401 }))
    const session = fakeSession({})
    session.refreshAccessToken.mockResolvedValueOnce(false)
    const authFetch = createAuthFetch({ session, language: () => 'en', baseFetch })

    const response = await authFetch(new Request(URL_ME))

    expect(response.status).toBe(401)
    expect(baseFetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    'https://s.example.com/api/auth/login?remember=true',
    'https://s.example.com/api/auth/2fa/verify',
    'https://s.example.com/api/auth/refresh',
  ])('never refreshes on a credential request (%s)', async (url) => {
    const baseFetch = jest.fn(async () => new Response(null, { status: 401 }))
    const session = fakeSession({})
    const authFetch = createAuthFetch({ session, language: () => 'en', baseFetch })

    await authFetch(new Request(url, { method: 'POST' }))

    expect(session.refreshAccessToken).not.toHaveBeenCalled()
  })

  it('does not try to refresh without a refresh token', async () => {
    const baseFetch = jest.fn(async () => new Response(null, { status: 401 }))
    const session = fakeSession({ refreshToken: null })
    const authFetch = createAuthFetch({ session, language: () => 'en', baseFetch })

    await authFetch(new Request(URL_ME))

    expect(session.refreshAccessToken).not.toHaveBeenCalled()
  })
})
