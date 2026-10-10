import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Button } from '@/components/Button'
import { Fab } from '@/components/Fab'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { BalanceHistoryCard } from '@/features/accounts/BalanceHistoryCard'
import { accountBalance, useAccount, useDeleteAccount, useSetAccountClosed } from '@/features/accounts/hooks'
import { useSyncConnection } from '@/features/connections/hooks'
import { useCanWrite, useDisplayFormat } from '@/features/session/hooks'
import { TransactionRow } from '@/features/transactions/TransactionRow'
import { useTransactions } from '@/features/transactions/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { formatDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatCurrency } from '@/lib/format'
import { spacing, useColors } from '@/theme'

export default function AccountScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const { dateLocale, locale } = useDisplayFormat()
  const canWrite = useCanWrite()
  const { id } = useLocalSearchParams<{ id: string }>()
  const account = useAccount(id)
  const transactions = useTransactions({ accountIds: [id] })
  const sync = useSyncConnection()
  const setClosed = useSetAccountClosed()
  const remove = useDeleteAccount()

  if (account.isPending) return <Loading />
  if (account.isError) return <ErrorState error={account.error} onRetry={() => account.refetch()} />

  const data = account.data
  const connected = Boolean(data.connection_id)
  const items = transactions.data?.pages.flatMap((p) => p.items) ?? []

  const runSync = async () => {
    try {
      await sync.mutateAsync(data.connection_id!)
      void account.refetch()
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  const toggleClosed = async () => {
    if (!data.is_closed) {
      const ok = await confirmDestructive(
        t('accounts.closeTitle'),
        connected ? t('accounts.closeBodyConnected') : t('accounts.closeBody'),
        t('accounts.close'),
      )
      if (!ok) return
    }
    try {
      await setClosed.mutateAsync({ id: data.id, closed: !data.is_closed })
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  const confirmDelete = async () => {
    if (!(await confirmDestructive(t('accounts.deleteTitle'), t('accounts.deleteBody', { name: data.name })))) return
    try {
      await remove.mutateAsync(data.id)
      router.back()
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  const header = (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <Text variant="label" tone="muted">
        {data.type === 'credit_card' ? t('accounts.owed') : t('accounts.balance')}
        {data.is_closed ? ` · ${t('accounts.closed')}` : ''}
      </Text>
      <AmountText variant="title" value={accountBalance(data)} currency={data.currency} />
      {data.type === 'credit_card' ? (
        <Text variant="caption" tone="muted">
          {[
            data.credit_limit != null ? t('accounts.limit', { amount: formatCurrency(data.credit_limit, data.currency, locale) }) : null,
            data.next_due_date ? t('accounts.nextDue', { date: formatDate(data.next_due_date, dateLocale) }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
      {canWrite ? (
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button label={t('common.edit')} variant="secondary" onPress={() => router.push({ pathname: '/account/form', params: { id: data.id } })} />
          </View>
          {connected && !data.is_closed ? (
            <View style={styles.action}>
              <Button label={t('connections.syncNow')} variant="secondary" onPress={runSync} loading={sync.isPending} />
            </View>
          ) : null}
          <View style={styles.action}>
            <Button
              label={data.is_closed ? t('accounts.reopen') : t('accounts.close')}
              variant="secondary"
              onPress={toggleClosed}
              loading={setClosed.isPending}
            />
          </View>
          {connected ? null : (
            <View style={styles.action}>
              <Button label={t('common.delete')} variant="ghost" onPress={confirmDelete} loading={remove.isPending} />
            </View>
          )}
        </View>
      ) : null}
      <BalanceHistoryCard account={data} />
    </View>
  )

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: data.display_name || data.name }} />
      <FlatList
        style={{ backgroundColor: colors.background }}
        data={items}
        keyExtractor={(tx) => tx.id}
        renderItem={({ item }) => <TransactionRow tx={item} />}
        onEndReached={() => transactions.hasNextPage && void transactions.fetchNextPage()}
        onEndReachedThreshold={0.5}
        refreshing={transactions.isRefetching}
        onRefresh={() => {
          void account.refetch()
          void transactions.refetch()
        }}
        ListHeaderComponent={header}
        ListEmptyComponent={transactions.isPending ? <Loading /> : <EmptyState title={t('transactions.emptyTitle')} />}
        ListFooterComponent={transactions.isFetchingNextPage ? <ActivityIndicator style={styles.footer} /> : <View style={styles.spacer} />}
      />
      {canWrite && !data.is_closed ? (
        <Fab
          label={t('transactions.newTitle')}
          onPress={() => router.push({ pathname: '/transaction/new', params: { accountId: data.id } })}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { padding: spacing.lg, gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  action: { flexGrow: 1, flexBasis: '45%' },
  footer: { padding: spacing.lg },
  spacer: { height: 96 },
})
