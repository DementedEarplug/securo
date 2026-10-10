import { jsonResponse } from '@/test/render'
import { checkServer, normalizeServerUrl } from './server'

describe('normalizeServerUrl', () => {
  it.each([
    ['securo.example.com', 'https://securo.example.com'],
    ['  https://Securo.Example.com/  ', 'https://securo.example.com'],
    ['https://securo.example.com/api', 'https://securo.example.com'],
    ['https://example.com/securo/api/', 'https://example.com/securo'],
    ['http://10.0.2.2:8000', 'http://10.0.2.2:8000'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeServerUrl(input)).toBe(expected)
  })

  it.each(['', '   ', 'ftp://example.com', 'https://exa mple.com'])('rejects %j', (input) => {
    expect(normalizeServerUrl(input)).toBeNull()
  })
})

describe('checkServer', () => {
  it('accepts a Securo server and reports password sign-in', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ enabled: false, provider_name: 'OIDC', local_auth_enabled: true }),
    )

    await expect(checkServer('https://s.example.com', fetchImpl)).resolves.toEqual({
      ok: true,
      localAuthEnabled: true,
      sso: null,
    })
    expect(fetchImpl).toHaveBeenCalledWith('https://s.example.com/api/auth/oidc/config', expect.anything())
  })

  it('reports an SSO-only server that has not allowed the app', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ enabled: true, local_auth_enabled: false }))

    await expect(checkServer('https://s.example.com', fetchImpl)).resolves.toEqual({
      ok: true,
      localAuthEnabled: false,
      sso: null,
    })
  })

  it('offers single sign-on only when the server allows the app redirect', async () => {
    const allowed = jest.fn(async () =>
      jsonResponse({
        enabled: true,
        provider_name: 'Pocket ID',
        local_auth_enabled: false,
        native_redirect_uris: ['securo://oidc'],
      }),
    )
    const otherApp = jest.fn(async () =>
      jsonResponse({ enabled: true, local_auth_enabled: true, native_redirect_uris: ['other://cb'] }),
    )
    const disabled = jest.fn(async () =>
      jsonResponse({ enabled: false, local_auth_enabled: true, native_redirect_uris: ['securo://oidc'] }),
    )

    await expect(checkServer('https://s.example.com', allowed)).resolves.toEqual({
      ok: true,
      localAuthEnabled: false,
      sso: { providerName: 'Pocket ID' },
    })
    await expect(checkServer('https://s.example.com', otherApp)).resolves.toMatchObject({ sso: null })
    await expect(checkServer('https://s.example.com', disabled)).resolves.toMatchObject({ sso: null })
  })

  it('tells an unreachable host from a non-Securo one', async () => {
    const offline = jest.fn(async () => {
      throw new TypeError('Network request failed')
    })
    const otherSite = jest.fn(async () => new Response('<html>', { status: 200 }))

    await expect(checkServer('https://s.example.com', offline)).resolves.toEqual({ ok: false, reason: 'unreachable' })
    await expect(checkServer('https://s.example.com', otherSite)).resolves.toEqual({ ok: false, reason: 'notSecuro' })
  })
})
