import { ApiError } from '@/api/errors'
import i18n from '@/i18n'
import { session } from '@/auth/session'
import { jsonResponse } from '@/test/render'
import {
  isPasskeyCapableServer,
  loginWithPasskey,
  passkeyErrorMessage,
  passkeyOrigin,
  PasskeyFailure,
  toCredentialJson,
  toPasskeyFailure,
  verifyPasskeySecondFactor,
} from './passkey'

jest.mock('react-native-passkey', () => ({
  Passkey: { get: jest.fn(), isSupported: jest.fn(() => true) },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Passkey } = require('react-native-passkey') as { Passkey: { get: jest.Mock; isSupported: jest.Mock } }

const assertion = {
  id: 'Y3JlZA==',
  rawId: 'Y3JlZA',
  type: 'public-key',
  authenticatorAttachment: 'platform',
  response: {
    clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0=',
    authenticatorData: 'a+b/',
    signature: 'c2ln',
    userHandle: 'dXNlcg==',
  },
}

describe('toCredentialJson', () => {
  it('normalizes ids and binary fields to unpadded base64url', () => {
    expect(toCredentialJson(assertion)).toEqual({
      id: 'Y3JlZA',
      rawId: 'Y3JlZA',
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: {
        clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0',
        authenticatorData: 'a-b_',
        signature: 'c2ln',
        userHandle: 'dXNlcg',
      },
      clientExtensionResults: {},
    })
  })

  it('falls back to id when the provider omits rawId, and drops an empty user handle', () => {
    const json = toCredentialJson({ ...assertion, rawId: undefined, response: { ...assertion.response, userHandle: '' } })
    expect(json.rawId).toBe('Y3JlZA')
    expect(json.response).not.toHaveProperty('userHandle')
  })
})

describe('server checks', () => {
  it.each([
    ['https://securo.example.com', true],
    ['https://securo.example.com/sub', true],
    ['http://localhost:8000', true],
    ['http://securo.example.com', false],
    ['https://192.168.1.10', false],
    ['http://10.0.2.2:8010', false],
    ['https://[::1]:8000', false],
  ])('%s → %s', (url, ok) => {
    expect(isPasskeyCapableServer(url)).toBe(ok)
  })

  it('derives the origin from the server URL', () => {
    expect(passkeyOrigin('https://Securo.Example.com:8443/sub')).toBe('https://securo.example.com:8443')
  })
})

describe('toPasskeyFailure', () => {
  it.each([
    [{ error: 'UserCancelled', message: 'x' }, 'cancelled'],
    [{ error: 'NoCredentials', message: 'x' }, 'noCredentials'],
    [{ error: 'NotSupported', message: 'x' }, 'unsupported'],
    [{ error: 'BadConfiguration', message: 'x' }, 'notConfigured'],
    [{ error: 'Native error', message: 'RP ID cannot be validated.' }, 'notConfigured'],
    [{ error: 'Unknown error', message: 'boom' }, 'failed'],
    [new Error('boom'), 'failed'],
  ])('%j → %s', (error, reason) => {
    expect(toPasskeyFailure(error).reason).toBe(reason)
  })
})

describe('passkeyErrorMessage', () => {
  const t = i18n.t.bind(i18n)

  it('stays quiet when the user backed out', () => {
    expect(passkeyErrorMessage(new PasskeyFailure('cancelled'), t)).toBeNull()
  })

  it('explains server-side origin problems by their code', () => {
    const error = new ApiError(400, 'Passkeys cannot be used on an IP address.', 'passkey_origin_ip')
    expect(passkeyErrorMessage(error, t)).toBe(i18n.t('auth.passkey.insecureServer'))
  })

  it('explains an unknown passkey', () => {
    expect(passkeyErrorMessage(new ApiError(401, 'Invalid passkey'), t)).toBe(i18n.t('auth.passkey.rejected'))
  })
})

describe('passkey sign-in', () => {
  const fetchMock = jest.fn<Promise<Response>, [Request]>()

  beforeEach(async () => {
    fetchMock.mockReset()
    Passkey.get.mockReset()
    Passkey.isSupported.mockReturnValue(true)
    globalThis.fetch = fetchMock as unknown as typeof fetch
    await session.signOut()
    await session.setServerUrl('https://securo.example.com')
  })

  const options = { challenge: 'Y2hhbA', rpId: 'securo.example.com', userVerification: 'required' }

  it('runs the ceremony and signs in with a refresh token', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ challenge_id: 'c1', options }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' }))
    Passkey.get.mockResolvedValueOnce(assertion)

    await loginWithPasskey('https://securo.example.com', ' me@example.com ')

    const [optionsRequest, verifyRequest] = fetchMock.mock.calls.map(([request]) => request)
    expect(optionsRequest!.url).toBe('https://securo.example.com/api/auth/passkeys/authenticate/options')
    expect(optionsRequest!.headers.get('origin')).toBe('https://securo.example.com')
    expect(await optionsRequest!.json()).toEqual({ email: 'me@example.com' })
    expect(Passkey.get).toHaveBeenCalledWith(options)
    expect(verifyRequest!.url).toBe('https://securo.example.com/api/auth/passkeys/authenticate/verify?remember=true')
    const body = (await verifyRequest!.json()) as { challenge_id: string; credential: { rawId: string } }
    expect(body.challenge_id).toBe('c1')
    expect(body.credential.rawId).toBe('Y3JlZA')
    expect(session.getState()).toMatchObject({ status: 'signedIn', refreshToken: 'r' })
  })

  it('refuses an insecure server before contacting it', async () => {
    await expect(loginWithPasskey('http://10.0.2.2:8010')).rejects.toMatchObject({ reason: 'insecureServer' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses on devices without passkey support', async () => {
    Passkey.isSupported.mockReturnValue(false)
    await expect(loginWithPasskey('https://securo.example.com')).rejects.toMatchObject({ reason: 'unsupported' })
  })

  it('names a cancelled ceremony and does not verify', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ challenge_id: 'c1', options }))
    Passkey.get.mockRejectedValueOnce({ error: 'UserCancelled', message: 'The user cancelled the request.' })

    await expect(loginWithPasskey('https://securo.example.com')).rejects.toMatchObject({ reason: 'cancelled' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(session.getState().status).toBe('signedOut')
  })

  it('completes the second factor with the sign-in challenge token', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ challenge_id: 'c2', options }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' }))
    Passkey.get.mockResolvedValueOnce(assertion)

    await verifyPasskeySecondFactor('https://securo.example.com', 'tmp')

    const [optionsRequest, verifyRequest] = fetchMock.mock.calls.map(([request]) => request)
    expect(optionsRequest!.url).toBe('https://securo.example.com/api/auth/passkeys/2fa/options')
    expect(await optionsRequest!.json()).toEqual({ temp_token: 'tmp' })
    expect(verifyRequest!.url).toBe('https://securo.example.com/api/auth/passkeys/2fa/verify?remember=true')
    expect(await verifyRequest!.json()).toMatchObject({ temp_token: 'tmp', challenge_id: 'c2' })
    expect(session.getState().status).toBe('signedIn')
  })
})
