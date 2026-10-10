import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import type { Account } from '@/api/types'
import { AmountText } from '@/components/AmountText'
import { Card } from '@/components/Card'
import { Fab } from '@/components/Fab'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { accountBalance, useAccounts, useDashboardSummary } from '@/features/accounts/hooks'
import { useCanWrite, useDisplayFormat } from '@/features/session/hooks'
import { spacing } from '@/theme'

export default function AccountsScreen() {
  const { t } = useTranslation()
  const accounts = useAccounts({ includeClosed: true })
  const canWrite = useCanWrite()
  const summary = useDashboardSummary()

  if (accounts.isPending) return <Loading />
  if (accounts.isError) return <ErrorState error={accounts.error} onRetry={() => accounts.refetch()} />

  const open = accounts.data.filter((a) => !a.is_closed)
  const closed = accounts.data.filter((a) => a.is_closed)
  const refresh = () => {
    void accounts.refetch()
    void summary.refetch()
  }

  return (
    <View style={styles.root}>
      <Screen onRefresh={refresh} refreshing={accounts.isRefetching}>
        {summary.data ? (
          <Card>
            <Text variant="label" tone="muted">
              {t('accounts.totalBalance')}
            </Text>
            <AmountText
              variant="title"
              value={summary.data.total_balance_primary ?? null}
              currency={summary.data.primary_currency}
            />
            <View style={styles.flows}>
              <View style={styles.flow}>
                <Text variant="caption" tone="muted">
                  {t('accounts.incomeThisMonth')}
                </Text>
                <AmountText
                  tone="income"
                  variant="label"
                  value={summary.data.monthly_income_primary ?? summary.data.monthly_income}
                  currency={summary.data.primary_currency}
                />
              </View>
              <View style={styles.flow}>
                <Text variant="caption" tone="muted">
                  {t('accounts.expensesThisMonth')}
                </Text>
                <AmountText
                  tone="expense"
                  variant="label"
                  value={summary.data.monthly_expenses_primary ?? summary.data.monthly_expenses}
                  currency={summary.data.primary_currency}
                />
              </View>
            </View>
          </Card>
        ) : null}

        {open.length === 0 ? (
          <EmptyState title={t('accounts.emptyTitle')} body={t('accounts.emptyBody')} />
        ) : (
          <Card style={styles.list}>
            {open.map((account) => (
              <AccountRow key={account.id} account={account} />
            ))}
          </Card>
        )}
        {closed.length ? (
          <>
            <SectionHeader title={t('accounts.closedAccounts')} />
            <Card style={styles.list}>
              {closed.map((account) => (
                <AccountRow key={account.id} account={account} />
              ))}
            </Card>
          </>
        ) : null}
        <View style={styles.fabSpace} />
      </Screen>
      {canWrite ? <Fab label={t('accounts.form.newTitle')} onPress={() => router.push('/account/form')} /> : null}
    </View>
  )
}

function AccountRow({ account }: { account: Account }) {
  const { t } = useTranslation()
  const { currency } = useDisplayFormat()
  const balance = accountBalance(account)
  const foreign = account.currency && account.currency !== currency && account.balance_primary != null
  return (
    <ListRow
      title={account.display_name || account.name}
      subtitle={[t(`accountTypes.${account.type}`, { defaultValue: account.type }), account.institution_name]
        .filter(Boolean)
        .join(' · ')}
      onPress={() => router.push({ pathname: '/account/[id]', params: { id: account.id } })}
      trailing={
        <View style={styles.balance}>
          <AmountText value={balance} currency={account.currency} tone={balance < 0 ? 'expense' : 'default'} variant="label" />
          {foreign ? <AmountText value={account.balance_primary} tone="muted" variant="caption" /> : null}
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fabSpace: { height: 72 },
  flows: { flexDirection: 'row', marginTop: spacing.sm },
  flow: { flex: 1, gap: 2 },
  list: { padding: 0, overflow: 'hidden' },
  balance: { alignItems: 'flex-end' },
})
