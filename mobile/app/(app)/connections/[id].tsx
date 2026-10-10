import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Linking, StyleSheet, View } from 'react-native'

import { ApiError } from '@/api/errors'
import { AmountText } from '@/components/AmountText'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { PickerField } from '@/components/PickerField'
import { SelectSheet } from '@/components/SelectSheet'
import { ErrorState, Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { accountBalance, useAccounts } from '@/features/accounts/hooks'
import { ConnectionStatus } from '@/features/connections/ConnectionStatus'
import {
  connectionName,
  connectionSettings,
  useConnections,
  useDeleteConnection,
  useProviders,
  useSyncConnection,
  useUpdateConnectionSettings,
  type PayeeSource,
} from '@/features/connections/hooks'
import { useCanWrite } from '@/features/session/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'
import { spacing } from '@/theme'

const PAYEE_SOURCES: PayeeSource[] = ['auto', 'merchant', 'payment_data', 'description', 'none']

export default function ConnectionScreen() {
  const { t } = useTranslation()
  const { id } = useLocalSearchParams<{ id: string }>()
  const canWrite = useCanWrite()
  const connections = useConnections()
  const accounts = useAccounts().data ?? []
  const providers = useProviders().data ?? []
  const sync = useSyncConnection()
  const update = useUpdateConnectionSettings(id)
  const remove = useDeleteConnection()
  const [name, setName] = useState<string | null>(null)
  const [choosingPayeeSource, setChoosingPayeeSource] = useState(false)

  if (connections.isPending) return <Loading />
  if (connections.isError) return <ErrorState error={connections.error} onRetry={() => connections.refetch()} />
  const connection = connections.data.find((c) => c.id === id)
  // Linked elsewhere (the web, another device) since the list was loaded.
  if (!connection) return <ErrorState error={new ApiError(404, null)} onRetry={() => connections.refetch()} />

  // Unset settings mean the server default, which is on for both switches below.
  const settings = connectionSettings(connection)
  const provider = providers.find((p) => p.name === connection.provider)
  const linked = accounts.filter((a) => a.connection_id === connection.id)
  const needsReconnect = connection.status !== 'active'
  const awaitingSelection = Boolean(settings.awaiting_account_selection)
  const notImported = settings.excluded_accounts?.length ?? 0
  const chooseAccounts = () => router.push({ pathname: '/connections/accounts', params: { id: connection.id } })

  const runSync = async () => {
    try {
      const result = await sync.mutateAsync(connection.id)
      Alert.alert(
        t('connections.syncDoneTitle'),
        result.merged_count ? t('connections.syncMerged', { count: result.merged_count }) : t('connections.syncDone'),
      )
    } catch (e) {
      showSyncError(e)
    }
  }

  const showSyncError = (e: unknown) => {
    const helpUrl = e instanceof ApiError ? e.helpUrl : null
    Alert.alert(t('common.errorTitle'), errorMessage(e, t), [
      ...(helpUrl ? [{ text: t('connections.openHelp'), onPress: () => void Linking.openURL(helpUrl) }] : []),
      { text: t('common.close'), style: 'cancel' as const },
    ])
  }

  const save = (body: Parameters<typeof update.mutateAsync>[0]) =>
    update.mutateAsync(body).catch((e) => showError(errorMessage(e, t)))

  const reconnect = () => {
    const params = { reconnectId: connection.id }
    if (connection.provider === 'simplefin') router.push({ pathname: '/connections/simplefin', params })
    else if (connection.provider === 'pluggy') router.push({ pathname: '/connections/pluggy', params })
    else router.push({ pathname: '/connections/enable-banking', params })
  }

  const confirmDelete = async () => {
    if (!(await confirmDestructive(t('connections.deleteTitle'), t('connections.deleteBody', { name: connectionName(connection) }))))
      return
    try {
      await remove.mutateAsync(connection.id)
      router.back()
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  return (
    <Screen onRefresh={() => connections.refetch()} refreshing={connections.isRefetching}>
      <Stack.Screen options={{ title: connectionName(connection) }} />
      <View style={styles.status}>
        <Text tone="muted">{provider?.display_name ?? connection.provider}</Text>
        <ConnectionStatus connection={connection} />
      </View>

      {awaitingSelection ? (
        <Card>
          <Text>{t('connections.awaitingSelection')}</Text>
        </Card>
      ) : null}
      {canWrite ? (
        needsReconnect ? (
          <Button label={t('connections.reconnect')} onPress={reconnect} />
        ) : awaitingSelection ? (
          <Button label={t('connections.chooseAccounts')} onPress={chooseAccounts} />
        ) : (
          <Button label={sync.isPending ? t('connections.syncing') : t('connections.syncNow')} onPress={runSync} loading={sync.isPending} />
        )
      ) : null}
      {sync.isPending ? (
        <Text variant="caption" tone="muted">
          {t('connections.syncPatience')}
        </Text>
      ) : null}

      <SectionHeader title={t('connections.accounts')} />
      <Card style={styles.list}>
        {linked.length === 0 ? (
          <ListRow title={t('connections.noAccounts')} />
        ) : (
          linked.map((account) => (
            <ListRow
              key={account.id}
              title={account.display_name || account.name}
              subtitle={
                [account.display_name && account.display_name !== account.name ? account.name : null, account.masked_number, account.is_closed ? t('accounts.closed') : null]
                  .filter(Boolean)
                  .join(' · ') || null
              }
              onPress={() => router.push({ pathname: '/account/[id]', params: { id: account.id } })}
              trailing={<AmountText variant="label" value={accountBalance(account)} currency={account.currency} />}
            />
          ))
        )}
        {awaitingSelection ? null : (
          <ListRow
            title={t('connections.chooseAccounts')}
            subtitle={notImported ? t('connections.notImportedCount', { count: notImported }) : null}
            onPress={chooseAccounts}
            showChevron
          />
        )}
      </Card>

      {canWrite ? (
        <>
          <SectionHeader title={t('connections.settings')} />
          <Card>
            <TextField
              label={t('connections.displayName')}
              value={name ?? connection.display_name ?? ''}
              placeholder={connection.institution_name}
              onChangeText={setName}
              onEndEditing={() => name !== null && save({ display_name: name.trim() || null })}
              returnKeyType="done"
            />
            <PickerField
              label={t('connections.payeeSource')}
              value={t(`connections.payeeSources.${settings.payee_source ?? 'auto'}`)}
              placeholder={t('connections.payeeSources.auto')}
              onPress={() => setChoosingPayeeSource(true)}
            />
            <SelectSheet
              visible={choosingPayeeSource}
              title={t('connections.payeeSource')}
              options={PAYEE_SOURCES.map((value) => ({ value, label: t(`connections.payeeSources.${value}`) }))}
              selected={settings.payee_source ?? 'auto'}
              onSelect={(value) => {
                setChoosingPayeeSource(false)
                if (value) void save({ payee_source: value as PayeeSource })
              }}
              onClose={() => setChoosingPayeeSource(false)}
            />
            <SwitchField
              label={t('connections.importPending')}
              hint={t('connections.importPendingHint')}
              value={settings.import_pending !== false}
              onChange={(import_pending) => save({ import_pending })}
            />
            {provider?.supports_asset_sync ? (
              <SwitchField
                label={t('connections.syncAssets')}
                hint={t('connections.syncAssetsHint')}
                value={settings.sync_assets !== false}
                onChange={(sync_assets) => save({ sync_assets })}
              />
            ) : null}
          </Card>
          {needsReconnect ? null : (
            <Button label={t('connections.reconnect')} variant="secondary" onPress={reconnect} />
          )}
          <Button label={t('connections.delete')} variant="destructive" onPress={confirmDelete} loading={remove.isPending} />
        </>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  status: { gap: spacing.xs },
  list: { padding: 0, overflow: 'hidden' },
})
