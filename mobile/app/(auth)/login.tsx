import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View, type TextInput } from 'react-native'

import { RateLimitedError } from '@/api/errors'
import { loginWithPassword } from '@/auth/login'
import { loginWithOidc, OidcError } from '@/auth/oidc'
import { loginWithPasskey, passkeyErrorMessage } from '@/auth/passkey'
import { checkServer } from '@/auth/server'
import { Button } from '@/components/Button'
import { Screen } from '@/components/Screen'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useSession } from '@/features/session/hooks'
import { errorMessage } from '@/lib/errors'
import { useCountdown } from '@/lib/use-countdown'
import { spacing, useColors } from '@/theme'

type Pending = 'password' | 'passkey' | 'sso' | null

export default function LoginScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const { serverUrl } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const countdown = useCountdown()
  const passwordRef = useRef<TextInput>(null)

  // How this server lets people in. Until it answers, assume passwords (the
  // common case); the server stays authoritative either way.
  const options = useQuery({
    queryKey: ['sign-in-options', serverUrl],
    queryFn: async () => {
      const result = await checkServer(serverUrl!)
      return result.ok ? result : null
    },
    enabled: Boolean(serverUrl),
  }).data
  const localAuth = options?.localAuthEnabled ?? true
  const sso = options?.sso ?? null

  const run = async (kind: Exclude<Pending, null>, action: () => Promise<void>) => {
    setPending(kind)
    setError(null)
    try {
      await action()
      // Signing in flips the root guard, which shows the app.
    } catch (e) {
      if (e instanceof RateLimitedError) countdown.start(e.retryAfterSeconds)
      setError(
        kind === 'passkey'
          ? passkeyErrorMessage(e, t)
          : kind === 'sso' && e instanceof OidcError
            ? (e.description ?? t('auth.sso.failed'))
            : errorMessage(e, t),
      )
    } finally {
      setPending(null)
    }
  }

  const submitPassword = () => {
    if (!email.trim() || !password) return
    void run('password', async () => {
      const outcome = await loginWithPassword(email, password)
      if (outcome.kind === 'twoFactor') {
        router.push({
          pathname: '/two-factor',
          params: { tempToken: outcome.tempToken, methods: outcome.methods.join(',') },
        })
      }
    })
  }

  const submitPasskey = () => void run('passkey', () => loginWithPasskey(serverUrl!, email))
  // Backing out of the browser tab is not an error; just stay here.
  const submitSso = () =>
    void run('sso', async () => {
      await loginWithOidc(serverUrl!)
    })

  const locked = countdown.remaining > 0
  const busy = pending !== null
  return (
    <Screen>
      <Text tone="muted">{t('auth.signingInTo', { server: serverUrl })}</Text>
      {sso ? (
        <Button
          label={t('auth.sso.continueWith', { provider: sso.providerName })}
          onPress={submitSso}
          loading={pending === 'sso'}
          disabled={busy && pending !== 'sso'}
          variant={localAuth ? 'secondary' : 'primary'}
        />
      ) : null}
      {sso && localAuth ? (
        <View style={styles.divider}>
          <View style={[styles.line, { backgroundColor: colors.border }]} />
          <Text variant="caption" tone="muted">
            {t('auth.or')}
          </Text>
          <View style={[styles.line, { backgroundColor: colors.border }]} />
        </View>
      ) : null}
      {localAuth ? (
        <>
          <TextField
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <TextField
            ref={passwordRef}
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submitPassword}
          />
        </>
      ) : null}
      {error ? <Text tone="destructive">{error}</Text> : null}
      {localAuth ? (
        <>
          <Button
            label={locked ? t('auth.tryAgainIn', { seconds: countdown.remaining }) : t('auth.signIn')}
            onPress={submitPassword}
            loading={pending === 'password'}
            disabled={locked || (busy && pending !== 'password') || !email.trim() || !password}
          />
          <Button
            label={t('auth.passkey.signIn')}
            variant="secondary"
            onPress={submitPasskey}
            loading={pending === 'passkey'}
            disabled={locked || (busy && pending !== 'passkey')}
          />
        </>
      ) : null}
      <Button label={t('auth.changeServer')} variant="ghost" onPress={() => router.replace('/server')} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
})
