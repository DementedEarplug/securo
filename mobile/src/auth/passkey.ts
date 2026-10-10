import type { TFunction } from 'i18next'
import { Passkey, type PasskeyGetRequest, type PasskeyGetResult } from 'react-native-passkey'

import { api, unwrap } from '@/api/client'
import { ApiError } from '@/api/errors'
import type { TokenResponse } from '@/api/types'
import { errorMessage } from '@/lib/errors'
import { toBase64Url } from './base64url'
import { deviceName, session } from './session'

const REMEMBER = { remember: true } as const

export type PasskeyFailureReason = 'unsupported' | 'cancelled' | 'noCredentials' | 'notConfigured' | 'insecureServer' | 'failed'

/** Why a passkey sign-in did not happen, in terms the UI can explain. */
export class PasskeyFailure extends Error {
  constructor(
    readonly reason: PasskeyFailureReason,
    detail?: string,
  ) {
    super(detail ?? reason)
    this.name = 'PasskeyFailure'
  }
}

/**
 * The origin the server should bind the ceremony to. Sent explicitly so the
 * server does not have to guess it from `Host` behind a proxy; Android's own
 * `android:apk-key-hash:` origin is accepted next to it once the server trusts
 * this app's signing key (`WEBAUTHN_ANDROID_*`).
 */
export function passkeyOrigin(serverUrl: string): string {
  const match = /^(https?:\/\/[^/?#]+)/i.exec(serverUrl)
  if (!match) throw new PasskeyFailure('insecureServer')
  return match[1]!.toLowerCase()
}

/** WebAuthn only works on a domain name over HTTPS (or localhost), never on an IP. */
export function isPasskeyCapableServer(serverUrl: string): boolean {
  const match = /^(https?):\/\/(\[[^\]]+\]|[^/:?#]+)/i.exec(serverUrl)
  if (!match) return false
  const [, scheme, host] = match
  const hostname = host!.toLowerCase()
  if (hostname.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false
  return scheme!.toLowerCase() === 'https' || hostname === 'localhost'
}

/**
 * The credential as the server reads it (`verify_authentication_response`
 * JSON). Ids and binary fields are forced to unpadded base64url: the server
 * looks passkeys up by the exact `rawId` string it stored.
 */
export function toCredentialJson(result: PasskeyGetResult): Record<string, unknown> {
  const { response } = result
  const id = toBase64Url(result.id)
  return {
    id,
    rawId: toBase64Url(result.rawId ?? result.id),
    type: result.type ?? 'public-key',
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      authenticatorData: toBase64Url(response.authenticatorData),
      signature: toBase64Url(response.signature),
      ...(response.userHandle ? { userHandle: toBase64Url(response.userHandle) } : {}),
    },
    clientExtensionResults: result.clientExtensionResults ?? {},
    ...(result.authenticatorAttachment ? { authenticatorAttachment: result.authenticatorAttachment } : {}),
  }
}

/** The library rejects with plain `{ error, message }` objects; name them. */
export function toPasskeyFailure(error: unknown): PasskeyFailure {
  if (error instanceof PasskeyFailure) return error
  const code = error && typeof error === 'object' && 'error' in error ? String((error as { error: unknown }).error) : ''
  const message =
    error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : undefined
  switch (code) {
    case 'UserCancelled':
      return new PasskeyFailure('cancelled', message)
    case 'NoCredentials':
      return new PasskeyFailure('noCredentials', message)
    case 'NotSupported':
      return new PasskeyFailure('unsupported', message)
    case 'BadConfiguration':
    case 'NotConfigured':
      return new PasskeyFailure('notConfigured', message)
    default:
      // Credential Manager reports an unverified app-to-domain link this way.
      if (message && /RP ID cannot be validated|asset ?links?/i.test(message)) {
        return new PasskeyFailure('notConfigured', message)
      }
      return new PasskeyFailure('failed', message)
  }
}

async function runCeremony(options: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const result = await Passkey.get(options as unknown as PasskeyGetRequest)
    return toCredentialJson(result)
  } catch (error) {
    throw toPasskeyFailure(error)
  }
}

function preflight(serverUrl: string): string {
  if (!Passkey.isSupported()) throw new PasskeyFailure('unsupported')
  if (!isPasskeyCapableServer(serverUrl)) throw new PasskeyFailure('insecureServer')
  return passkeyOrigin(serverUrl)
}

/** Sign in with a passkey (the email narrows the picker to that account's keys). */
export async function loginWithPasskey(serverUrl: string, email?: string): Promise<void> {
  const origin = preflight(serverUrl)
  const { challenge_id, options } = await unwrap(
    api().POST('/api/auth/passkeys/authenticate/options', {
      body: { email: email?.trim() || null },
      headers: { Origin: origin },
    }),
  )
  const credential = await runCeremony(options)
  const tokens = await unwrap<TokenResponse>(
    api().POST('/api/auth/passkeys/authenticate/verify', {
      params: { query: REMEMBER },
      body: { challenge_id, credential },
      headers: { Origin: origin, 'X-Device-Name': deviceName() },
    }),
  )
  await session.signIn(tokens)
}

/** Second step of a password sign-in, with a passkey instead of a TOTP code. */
export async function verifyPasskeySecondFactor(serverUrl: string, tempToken: string): Promise<void> {
  const origin = preflight(serverUrl)
  const { challenge_id, options } = await unwrap(
    api().POST('/api/auth/passkeys/2fa/options', {
      body: { temp_token: tempToken },
      headers: { Origin: origin },
    }),
  )
  const credential = await runCeremony(options)
  const tokens = await unwrap<TokenResponse>(
    api().POST('/api/auth/passkeys/2fa/verify', {
      params: { query: REMEMBER },
      body: { temp_token: tempToken, challenge_id, credential },
      headers: { Origin: origin, 'X-Device-Name': deviceName() },
    }),
  )
  await session.signIn(tokens)
}

const SERVER_CODES: Record<string, string> = {
  passkey_origin_ip: 'auth.passkey.insecureServer',
  passkey_origin_insecure: 'auth.passkey.insecureServer',
  passkey_origin_mismatch: 'auth.passkey.notConfigured',
}

/** A sentence for a failed passkey sign-in, or null when the user simply backed out. */
export function passkeyErrorMessage(error: unknown, t: TFunction): string | null {
  if (error instanceof PasskeyFailure) {
    if (error.reason === 'cancelled') return null
    return t(`auth.passkey.${error.reason}`)
  }
  if (error instanceof ApiError) {
    const key = error.code ? SERVER_CODES[error.code] : undefined
    if (key) return t(key)
    if (error.status === 401) return t('auth.passkey.rejected')
  }
  return errorMessage(error, t)
}
