import { api, formBody, unwrap } from '@/api/client'
import type { TokenResponse, TwoFactorChallenge } from '@/api/types'
import { deviceName, session } from './session'

export type LoginOutcome =
  | { kind: 'signedIn' }
  | { kind: 'twoFactor'; tempToken: string; methods: string[] }

// Native clients ask for a refresh token so the session outlives the 24h
// access token; the web app never sends this and is unaffected.
const REMEMBER = { remember: true } as const

function isChallenge(body: TokenResponse | TwoFactorChallenge): body is TwoFactorChallenge {
  return 'requires_2fa' in body && body.requires_2fa === true
}

export async function loginWithPassword(email: string, password: string): Promise<LoginOutcome> {
  const body = await unwrap<TokenResponse | TwoFactorChallenge>(
    api().POST('/api/auth/login', {
      params: { query: REMEMBER },
      body: { username: email.trim(), password, scope: '' },
      bodySerializer: formBody,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Device-Name': deviceName(),
      },
    }),
  )
  if (isChallenge(body)) {
    return { kind: 'twoFactor', tempToken: body.temp_token, methods: body.available_methods }
  }
  await session.signIn(body)
  return { kind: 'signedIn' }
}

export async function verifyTotp(tempToken: string, code: string): Promise<void> {
  const body = await unwrap<TokenResponse>(
    api().POST('/api/auth/2fa/verify', {
      params: { query: REMEMBER },
      body: { temp_token: tempToken, code },
      headers: { 'X-Device-Name': deviceName() },
    }),
  )
  await session.signIn(body)
}
