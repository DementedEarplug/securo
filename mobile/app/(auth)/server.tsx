import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { checkServer, normalizeServerUrl } from '@/auth/server'
import { session } from '@/auth/session'
import { Button } from '@/components/Button'
import { Screen } from '@/components/Screen'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useSession } from '@/features/session/hooks'

export default function ServerScreen() {
  const { t } = useTranslation()
  const { serverUrl } = useSession()
  const [input, setInput] = useState(serverUrl ?? '')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const submit = async () => {
    const url = normalizeServerUrl(input)
    if (!url) {
      setError(t('auth.serverInvalid'))
      return
    }
    setChecking(true)
    setError(null)
    const result = await checkServer(url)
    setChecking(false)
    if (!result.ok) {
      setError(t(result.reason === 'unreachable' ? 'auth.serverUnreachable' : 'auth.serverNotSecuro'))
      return
    }
    if (!result.localAuthEnabled && !result.sso) {
      setError(t('auth.serverSsoOnly'))
      return
    }
    await session.setServerUrl(url)
    router.replace('/login')
  }

  const insecure = /^http:\/\//i.test(normalizeServerUrl(input) ?? '')

  return (
    <Screen>
      <Text variant="title">{t('auth.welcome')}</Text>
      <Text tone="muted">{t('auth.serverIntro')}</Text>
      <TextField
        label={t('auth.serverLabel')}
        value={input}
        onChangeText={setInput}
        placeholder="https://securo.example.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        inputMode="url"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={error}
      />
      {insecure ? (
        <Text variant="caption" tone="muted">
          {t('auth.serverInsecure')}
        </Text>
      ) : null}
      <Button label={t('common.continue')} onPress={submit} loading={checking} disabled={!input.trim()} />
    </Screen>
  )
}
