import { router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { PluggyConnect } from 'react-native-pluggy-connect'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Screen } from '@/components/Screen'
import { ErrorState } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import {
  fetchConnectToken,
  fetchReconnectToken,
  useCompleteLink,
  useConnections,
  useSyncConnection,
} from '@/features/connections/hooks'
import { alertLinkError } from '@/features/connections/link-errors'
import { spacing, useColors } from '@/theme'

/**
 * Pluggy (Brazilian banks) runs its own Connect widget; the app hosts it and
 * hands the resulting item id to the server, exactly as the web app does.
 */
export default function PluggyScreen() {
  const { t, i18n } = useTranslation()
  const colors = useColors()
  const { reconnectId } = useLocalSearchParams<{ reconnectId?: string }>()
  const connection = useConnections().data?.find((c) => c.id === reconnectId)
  const link = useCompleteLink()
  const sync = useSyncConnection()
  const [syncAssets, setSyncAssets] = useState(true)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [loadingToken, setLoadingToken] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  // Reconnecting has nothing to choose first: fetch its token right away.
  const reconnect = useQuery({
    queryKey: ['pluggy-reconnect-token', reconnectId],
    queryFn: () => fetchReconnectToken(reconnectId!),
    enabled: Boolean(reconnectId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
  const token = dismissed ? null : (newToken ?? reconnect.data ?? null)
  const setToken = (value: string | null) => {
    setNewToken(value)
    if (value === null) setDismissed(true)
  }

  const start = async () => {
    setLoadingToken(true)
    setDismissed(false)
    try {
      setNewToken(await fetchConnectToken())
    } catch (e) {
      alertLinkError(e, t)
    } finally {
      setLoadingToken(false)
    }
  }


  const finish = async (itemId: string) => {
    setToken(null)
    try {
      if (reconnectId) {
        // Re-linking keeps the connection; pull fresh data with the new login.
        await sync.mutateAsync(reconnectId)
        router.replace({ pathname: '/connections/[id]', params: { id: reconnectId } })
      } else {
        const created = await link.mutateAsync({ code: itemId, provider: 'pluggy', sync_assets: syncAssets })
        router.replace({ pathname: '/connections/[id]', params: { id: created.id } })
      }
    } catch (e) {
      alertLinkError(e, t)
    }
  }

  if (reconnect.isError) return <ErrorState error={reconnect.error} onRetry={() => reconnect.refetch()} />

  if (link.isPending || sync.isPending || (reconnectId && reconnect.isPending)) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        {link.isPending || sync.isPending ? (
          <Text tone="muted" style={styles.centerText}>
            {t('connections.linkPatience')}
          </Text>
        ) : null}
      </View>
    )
  }

  if (token) {
    return (
      <PluggyConnect
        connectToken={token}
        updateItem={reconnectId ? (connection?.external_id ?? undefined) : undefined}
        language={i18n.language === 'pt-BR' ? 'pt' : 'en'}
        theme={colors.background === '#0C0D12' ? 'dark' : 'light'}
        forceOauthInBrowser={false}
        onSuccess={({ item }) => void finish(item.id)}
        onError={(error) => {
          setToken(null)
          alertLinkError(new Error(error.message || t('errors.generic')), t)
        }}
        onClose={() => {
          setToken(null)
          if (reconnectId) router.back()
        }}
      />
    )
  }

  return (
    <Screen>
      <Text variant="heading">{t('connections.pluggy.title')}</Text>
      <Card>
        <Text tone="muted">{t('connections.pluggy.intro')}</Text>
        <SwitchField
          label={t('connections.syncAssets')}
          hint={t('connections.syncAssetsHint')}
          value={syncAssets}
          onChange={setSyncAssets}
        />
      </Card>
      <Button label={t('common.continue')} onPress={start} loading={loadingToken} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  centerText: { textAlign: 'center' },
})
