import * as Clipboard from 'expo-clipboard'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Screen } from '@/components/Screen'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useCompleteLink } from '@/features/connections/hooks'
import { alertLinkError } from '@/features/connections/link-errors'
import { spacing } from '@/theme'

// Where SimpleFIN users create a setup token (same link as the web app).
const BRIDGE_URL = 'https://bridge.simplefin.org/simplefin/create'

export default function SimpleFinScreen() {
  const { t } = useTranslation()
  const { reconnectId } = useLocalSearchParams<{ reconnectId?: string }>()
  const link = useCompleteLink()
  const [token, setToken] = useState('')
  const [syncAssets, setSyncAssets] = useState(true)

  const paste = async () => setToken((await Clipboard.getStringAsync()).trim())

  const submit = async () => {
    try {
      const connection = await link.mutateAsync({
        code: token.trim(),
        provider: 'simplefin',
        // One SimpleFIN login often covers a whole household, so a new link
        // imports nothing until the accounts for this workspace are chosen.
        ...(reconnectId ? { reconnect_connection_id: reconnectId } : { sync_assets: syncAssets, select_accounts: true }),
      })
      router.replace({ pathname: '/connections/[id]', params: { id: connection.id } })
      if (!reconnectId) router.push({ pathname: '/connections/accounts', params: { id: connection.id } })
    } catch (e) {
      alertLinkError(e, t)
    }
  }

  return (
    <Screen>
      <Text variant="heading">{reconnectId ? t('connections.simplefin.reconnectTitle') : t('connections.simplefin.title')}</Text>
      <Card>
        <Text>{t('connections.simplefin.step1')}</Text>
        <Button label={t('connections.simplefin.openBridge')} variant="secondary" onPress={() => void Linking.openURL(BRIDGE_URL)} />
        <Text>{t('connections.simplefin.step2')}</Text>
        <TextField
          label={t('connections.simplefin.token')}
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          style={styles.token}
          placeholder="aHR0cHM6Ly9…"
        />
        <View style={styles.row}>
          <Button label={t('connections.simplefin.paste')} variant="ghost" onPress={paste} />
        </View>
        {reconnectId ? null : (
          <SwitchField
            label={t('connections.syncAssets')}
            hint={t('connections.syncAssetsHint')}
            value={syncAssets}
            onChange={setSyncAssets}
          />
        )}
      </Card>
      <Button label={t('connections.connect')} onPress={submit} loading={link.isPending} disabled={!token.trim()} />
      {link.isPending ? (
        <Text variant="caption" tone="muted">
          {t('connections.simplefin.claiming')}
        </Text>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  token: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
  row: { alignItems: 'flex-start' },
})
