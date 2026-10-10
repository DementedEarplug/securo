import { jsonResponse } from '@/test/render'
import { SessionStore } from './session'

function memoryStorage() {
  const saved = { serverUrl: null as string | null, accessToken: null as string | null, refreshToken: null as string | null, workspaceId: null as string | null }
  return {
    saved,
    loadSession: jest.fn(async () => ({ ...saved })),
    saveTokens: jest.fn(async (access: string | null, refresh: string | null) => {
      saved.accessToken = access
      saved.refreshToken = refresh
    }),
    saveServerUrl: jest.fn(async (url: string | null) => void (saved.serverUrl = url)),
    saveWorkspaceId: jest.fn(async (id: string | null) => void (saved.workspaceId = id)),
  }
}

async function signedIn(fetchImpl: jest.Mock) {
  const storage = memoryStorage()
  const store = new SessionStore(storage, fetchImpl)
  await store.setServerUrl('https://s.example.com')
  await store.signIn({ access_token: 'access-1', refresh_token: 'refresh-1', token_type: 'bearer' })
  return { store, storage }
}

describe('SessionStore', () => {
  it('restores a saved session on launch', async () => {
    const storage = memoryStorage()
    Object.assign(storage.saved, { serverUrl: 'https://s.example.com', refreshToken: 'r' })
    const store = new SessionStore(storage, jest.fn())

    await store.hydrate()

    expect(store.getState()).toMatchObject({ status: 'signedIn', refreshToken: 'r' })
  })

  it('starts signed out without credentials', async () => {
    const store = new SessionStore(memoryStorage(), jest.fn())
    await store.hydrate()
    expect(store.getState().status).toBe('signedOut')
  })

  it('exchanges the refresh token and stores the rotated pair', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ access_token: 'access-2', refresh_token: 'refresh-2', token_type: 'bearer' }),
    )
    const { store, storage } = await signedIn(fetchImpl)

    await expect(store.refreshAccessToken()).resolves.toBe(true)

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://s.example.com/api/auth/refresh',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ refresh_token: 'refresh-1' }) }),
    )
    expect(store.getState()).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-2' })
    expect(storage.saved.refreshToken).toBe('refresh-2')
  })

  it('shares one refresh between concurrent callers', async () => {
    // The server rotates on use: a second request with the old token would be
    // treated as theft and end the session.
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ access_token: 'access-2', refresh_token: 'refresh-2', token_type: 'bearer' }),
    )
    const { store } = await signedIn(fetchImpl)

    await Promise.all([store.refreshAccessToken(), store.refreshAccessToken(), store.refreshAccessToken()])

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('signs out when the server rejects the refresh token', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ detail: 'Invalid refresh token' }, { status: 401 }))
    const { store, storage } = await signedIn(fetchImpl)

    await expect(store.refreshAccessToken()).resolves.toBe(false)

    expect(store.getState()).toMatchObject({ status: 'signedOut', accessToken: null, refreshToken: null })
    expect(storage.saved.refreshToken).toBeNull()
  })

  it('stays signed in when the server cannot be reached', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed')
    })
    const { store } = await signedIn(fetchImpl)

    await expect(store.refreshAccessToken()).resolves.toBe(false)

    expect(store.getState().status).toBe('signedIn')
  })

  it('revokes the refresh token on sign-out, even when offline', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('offline')
    })
    const { store } = await signedIn(fetchImpl)

    await store.signOut({ revoke: true })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://s.example.com/api/auth/logout',
      expect.objectContaining({ body: JSON.stringify({ refresh_token: 'refresh-1' }) }),
    )
    expect(store.getState().status).toBe('signedOut')
  })
})
