import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError, RateLimitedError } from '@/api/errors'
import { verifyTotp } from '@/auth/login'
import { passkeyErrorMessage, verifyPasskeySecondFactor } from '@/auth/passkey'
import { Button } from '@/components/Button'
import { Screen } from '@/components/Screen'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useSession } from '@/features/session/hooks'
import { errorMessage } from '@/lib/errors'
import { useCountdown } from '@/lib/use-countdown'

/** The sign-in challenge expired or was used up (a wrong code is a 400). */
const TOKEN_ERRORS = new Set(['Invalid or expired token', 'Invalid token'])

export default function TwoFactorScreen() {
  const { t } = useTranslation()
  const { serverUrl } = useSession()
  const { tempToken, methods } = useLocalSearchParams<{ tempToken: string; methods?: string }>()
  const passkeyAvailable = (methods ?? '').split(',').includes('passkey')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<'totp' | 'passkey' | null>(null)
  const countdown = useCountdown()

  const handleFailure = (e: unknown, describe: (e: unknown) => string | null) => {
    if (e instanceof RateLimitedError) countdown.start(e.retryAfterSeconds)
    // The challenge lasts 5 minutes; after that, start over from the password.
    if (e instanceof ApiError && e.status === 401 && TOKEN_ERRORS.has(e.detail ?? '')) {
      router.back()
      return
    }
    setError(describe(e))
  }

  const submit = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError(t('auth.codeFormat'))
      return
    }
    setSubmitting('totp')
    setError(null)
    try {
      await verifyTotp(tempToken, code)
    } catch (e) {
      handleFailure(e, (err) => errorMessage(err, t))
      setCode('')
    } finally {
      setSubmitting(null)
    }
  }

  const confirmWithPasskey = async () => {
    setSubmitting('passkey')
    setError(null)
    try {
      await verifyPasskeySecondFactor(serverUrl!, tempToken)
    } catch (e) {
      handleFailure(e, (err) => passkeyErrorMessage(err, t))
    } finally {
      setSubmitting(null)
    }
  }

  const locked = countdown.remaining > 0
  return (
    <Screen>
      <Text tone="muted">{t('auth.twoFactorIntro')}</Text>
      <TextField
        label={t('auth.code')}
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoFocus
        maxLength={6}
        returnKeyType="go"
        onSubmitEditing={submit}
        error={error}
      />
      <Button
        label={locked ? t('auth.tryAgainIn', { seconds: countdown.remaining }) : t('auth.verify')}
        onPress={submit}
        loading={submitting === 'totp'}
        disabled={locked || submitting === 'passkey' || code.length !== 6}
      />
      {passkeyAvailable ? (
        <Button
          label={t('auth.passkey.useInstead')}
          variant="secondary"
          onPress={confirmWithPasskey}
          loading={submitting === 'passkey'}
          disabled={locked || submitting === 'totp'}
        />
      ) : null}
    </Screen>
  )
}
