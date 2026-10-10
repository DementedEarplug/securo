import type { TFunction } from 'i18next'

import { ApiError, NetworkError, RateLimitedError } from '@/api/errors'

/** Backend `detail` codes with a translation; anything else shows generically. */
const KNOWN_DETAILS: Record<string, string> = {
  LOGIN_BAD_CREDENTIALS: 'errors.badCredentials',
  'Invalid 2FA code': 'errors.invalidCode',
  'Invalid or expired token': 'errors.challengeExpired',
  'Read-only role': 'errors.readOnly',
  LOCAL_AUTH_DISABLED: 'errors.localAuthDisabled',
}

/** Structured `detail.code` values with a translation. */
const KNOWN_CODES: Record<string, string> = {
  setup_token_used: 'errors.setupTokenUsed',
  credentials_invalid: 'errors.credentialsInvalid',
  no_accounts_linked: 'errors.noAccountsLinked',
}

/** A sentence for the user describing why a request failed. */
export function errorMessage(error: unknown, t: TFunction): string {
  if (error instanceof RateLimitedError) {
    return t('errors.rateLimited', { seconds: error.retryAfterSeconds })
  }
  if (error instanceof NetworkError) return t('errors.network')
  if (error instanceof ApiError) {
    const byCode = error.code ? KNOWN_CODES[error.code] : undefined
    if (byCode) return t(byCode)
    const key = error.detail ? KNOWN_DETAILS[error.detail] : undefined
    if (key) return t(key)
    if (error.status >= 500) return t('errors.server')
    return error.detail ?? t('errors.generic')
  }
  return t('errors.generic')
}
