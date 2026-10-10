import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Alert, StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Fab } from '@/components/Fab'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { accountNameById, useAccounts } from '@/features/accounts/hooks'
import { useGenerateRecurring, useRecurring } from '@/features/recurring/hooks'
import { useCanWrite, useDisplayFormat } from '@/features/session/hooks'
import { formatDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { spacing } from '@/theme'

export default function RecurringScreen() {
  const { t } = useTranslation()
  const { dateLocale } = useDisplayFormat()
  const canWrite = useCanWrite()
  const recurring = useRecurring()
  const accounts = useAccounts({ includeClosed: true }).data ?? []
  const generate = useGenerateRecurring()

  if (recurring.isPending) return <Loading />
  if (recurring.isError) return <ErrorState error={recurring.error} onRetry={() => recurring.refetch()} />

  const runGenerate = async () => {
    try {
      const { generated } = await generate.mutateAsync(undefined)
      Alert.alert(t('recurring.generatedTitle'), t('recurring.generatedBody', { count: generated }))
    } catch (e) {
      Alert.alert(t('common.errorTitle'), errorMessage(e, t))
    }
  }

  const active = recurring.data.filter((r) => r.is_active)
  const paused = recurring.data.filter((r) => !r.is_active)

  const row = (item: (typeof recurring.data)[number]) => (
    <ListRow
      key={item.id}
      title={item.description}
      subtitle={[
        t(`common.frequencies.${item.frequency}`, { defaultValue: item.frequency }),
        item.is_active ? t('recurring.next', { date: formatDate(item.next_occurrence, dateLocale) }) : t('recurring.paused'),
        accountNameById(accounts, item.account_id),
      ]
        .filter(Boolean)
        .join(' · ')}
      onPress={canWrite ? () => router.push({ pathname: '/recurring/form', params: { id: item.id } }) : undefined}
      trailing={
        <AmountText
          variant="label"
          value={item.type === 'debit' ? -Number(item.amount) : Number(item.amount)}
          currency={item.currency}
          tone={item.type === 'credit' ? 'income' : 'expense'}
        />
      }
    />
  )

  return (
    <View style={styles.root}>
      <Screen onRefresh={() => recurring.refetch()} refreshing={recurring.isRefetching}>
        {recurring.data.length === 0 ? (
          <EmptyState title={t('recurring.emptyTitle')} body={t('recurring.emptyBody')} />
        ) : (
          <>
            {canWrite ? (
              <Button label={t('recurring.generate')} variant="secondary" onPress={runGenerate} loading={generate.isPending} />
            ) : null}
            <Card style={styles.list}>{active.map(row)}</Card>
            {paused.length ? (
              <>
                <Text variant="label" tone="muted">
                  {t('recurring.pausedSection')}
                </Text>
                <Card style={styles.list}>{paused.map(row)}</Card>
              </>
            ) : null}
          </>
        )}
        <View style={styles.fabSpace} />
      </Screen>
      {canWrite ? <Fab label={t('recurring.newTitle')} onPress={() => router.push('/recurring/form')} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 0, overflow: 'hidden' },
  fabSpace: { height: 72, marginTop: spacing.sm },
})
