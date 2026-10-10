import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { ErrorState, Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { useConnectionAccounts, useUpdateConnectionAccounts } from '@/features/connections/hooks'
import {
  accountState,
  groupByInstitution,
  initiallyIncluded,
  selectionChange,
  type ConnectionAccount,
} from '@/features/connections/selection'
import { useCanWrite } from '@/features/session/hooks'
import { errorMessage } from '@/lib/errors'
import { spacing, useColors } from '@/theme'

type HistoryChoice = 'cancel' | 'keep' | 'delete'

/**
 * Which of a connection's accounts are imported. Opened right after linking
 * SimpleFIN (nothing is imported until this is saved) and from a connection's
 * screen, so one bank login can feed several workspaces with different accounts.
 */
export default function ConnectionAccountsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const query = useConnectionAccounts(id)
  if (query.isPending) return <Loading />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  return <Selection id={id} data={query.data} />
}

function Selection({ id, data }: { id: string; data: NonNullable<ReturnType<typeof useConnectionAccounts>['data']> }) {
  const { t } = useTranslation()
  const canWrite = useCanWrite()
  const save = useUpdateConnectionAccounts(id)
  const [included, setIncluded] = useState(() => initiallyIncluded(data.accounts))
  const [importNew, setImportNew] = useState(data.import_new_accounts)
  const change = selectionChange(data.accounts, included)
  const dirty = change.changed || importNew !== data.import_new_accounts || data.awaiting_selection
  const allOn = included.size === data.accounts.length

  const toggle = (externalId: string, on: boolean) =>
    setIncluded((current) => {
      const next = new Set(current)
      if (on) next.add(externalId)
      else next.delete(externalId)
      return next
    })

  const askAboutHistory = (accounts: ConnectionAccount[]) =>
    new Promise<HistoryChoice>((resolve) => {
      const count = accounts.reduce((sum, a) => sum + (a.transaction_count ?? 0), 0)
      Alert.alert(
        t('connections.selection.historyTitle'),
        t('connections.selection.historyBody', { names: accounts.map((a) => a.name).join(', '), count }),
        [
          { text: t('common.cancel'), style: 'cancel', onPress: () => resolve('cancel') },
          { text: t('connections.selection.keepHistory'), onPress: () => resolve('keep') },
          { text: t('connections.selection.deleteHistory'), style: 'destructive', onPress: () => resolve('delete') },
        ],
        { cancelable: true, onDismiss: () => resolve('cancel') },
      )
    })

  const submit = async () => {
    let removeHistory: string[] = []
    if (change.losingHistory.length) {
      const choice = await askAboutHistory(change.losingHistory)
      if (choice === 'cancel') return
      if (choice === 'delete') removeHistory = change.losingHistory.map((a) => a.external_id)
    }
    try {
      await save.mutateAsync({ excluded: change.excluded, import_new_accounts: importNew, remove_history: removeHistory })
      if (change.importing.length) {
        Alert.alert(
          t('connections.selection.doneTitle'),
          t('connections.selection.doneImported', { count: change.importing.length }),
        )
      }
      router.back()
    } catch (e) {
      Alert.alert(t('common.errorTitle'), errorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Text tone="muted">
        {data.awaiting_selection ? t('connections.selection.introInitial') : t('connections.selection.intro')}
      </Text>

      {canWrite && data.accounts.length > 1 ? (
        <View style={styles.bulk}>
          <Button
            label={allOn ? t('connections.selection.clearAll') : t('connections.selection.selectAll')}
            variant="ghost"
            onPress={() => setIncluded(allOn ? new Set() : new Set(data.accounts.map((a) => a.external_id)))}
          />
        </View>
      ) : null}

      {data.accounts.length === 0 ? (
        <Card>
          <Text tone="muted">{t('connections.noAccounts')}</Text>
        </Card>
      ) : (
        groupByInstitution(data.accounts).map((group) => (
          <View key={group.institution ?? ''} style={styles.group}>
            {group.institution ? <SectionHeader title={group.institution} /> : null}
            <Card style={styles.list}>
              {group.accounts.map((account) => (
                <AccountRow
                  key={account.external_id}
                  account={account}
                  included={included.has(account.external_id)}
                  onChange={(on) => toggle(account.external_id, on)}
                  disabled={!canWrite || save.isPending}
                />
              ))}
            </Card>
          </View>
        ))
      )}

      <Card>
        <SwitchField
          label={t('connections.selection.importNew')}
          hint={t('connections.selection.importNewHint')}
          value={importNew}
          onChange={setImportNew}
          disabled={!canWrite || save.isPending}
        />
      </Card>

      {canWrite ? (
        <Button
          label={change.importing.length ? t('connections.selection.saveAndImport', { count: change.importing.length }) : t('common.save')}
          onPress={() => void submit()}
          loading={save.isPending}
          disabled={!dirty}
        />
      ) : null}
      {save.isPending && change.importing.length ? (
        <Text variant="caption" tone="muted">
          {t('connections.linkPatience')}
        </Text>
      ) : null}
    </Screen>
  )
}

function AccountRow({
  account,
  included,
  onChange,
  disabled,
}: {
  account: ConnectionAccount
  included: boolean
  onChange: (included: boolean) => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const state = accountState(account, included)
  const title = [account.name, account.masked_number].filter(Boolean).join(' · ')
  const balance = account.balance == null ? null : Number(account.balance)
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: included, disabled }}
      accessibilityLabel={title}
      onPress={() => onChange(!included)}
      disabled={disabled}
      android_ripple={{ color: colors.muted }}
      style={[styles.row, { borderBottomColor: colors.border }]}
    >
      <View style={styles.text}>
        <Text numberOfLines={1}>{title}</Text>
        <Text
          variant="caption"
          tone={state === 'willStop' ? 'destructive' : 'muted'}
          numberOfLines={1}
        >
          {t(`connections.selection.state.${state}`, { count: account.transaction_count ?? 0 })}
        </Text>
      </View>
      {balance == null || Number.isNaN(balance) ? null : (
        <AmountText variant="caption" value={balance} currency={account.currency} />
      )}
      <Switch
        value={included}
        onValueChange={onChange}
        disabled={disabled}
        importantForAccessibility="no"
        trackColor={{ true: colors.primary, false: colors.muted }}
        thumbColor={colors.card}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bulk: { alignItems: 'flex-end' },
  group: { gap: spacing.xs },
  list: { padding: 0, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 2 },
})
