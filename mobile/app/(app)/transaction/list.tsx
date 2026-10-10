import { Stack, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native'

import { EmptyState, ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { formatRange } from '@/features/reports/buckets'
import { parseDrillDownParams, UNCATEGORIZED } from '@/features/reports/drilldown'
import { useDisplayFormat } from '@/features/session/hooks'
import { useTransactions, type TransactionFilters } from '@/features/transactions/hooks'
import { TransactionRow } from '@/features/transactions/TransactionRow'
import { spacing, useColors } from '@/theme'

/** The transactions behind a number on a report (see `drillDown`). */
export default function TransactionListScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const { dateLocale } = useDisplayFormat()
  const raw = useLocalSearchParams()
  const params = parseDrillDownParams(raw)
  const categories = params.categoryIds ?? []
  // "Uncategorized" is its own filter; it can't be combined with category ids.
  const uncategorized = categories.length === 1 && categories[0] === UNCATEGORIZED
  const filters: TransactionFilters = {
    from: params.from,
    to: params.to,
    accountIds: params.accountIds,
    categoryIds: uncategorized ? undefined : categories.filter((c) => c !== UNCATEGORIZED),
    uncategorized,
    payeeId: params.payeeId,
    type: params.type,
    q: params.q,
    reportScope: true,
  }

  const transactions = useTransactions(filters)
  const items = transactions.data?.pages.flatMap((page) => page.items) ?? []
  const total = transactions.data?.pages[0]?.total
  const range = params.from && params.to ? formatRange({ from: params.from, to: params.to }, dateLocale) : null

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: params.title || t('transactions.title') }} />
      {transactions.isPending ? (
        <Loading />
      ) : transactions.isError ? (
        <ErrorState error={transactions.error} onRetry={() => transactions.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(tx) => tx.id}
          renderItem={({ item }) => <TransactionRow tx={item} />}
          onEndReached={() => transactions.hasNextPage && void transactions.fetchNextPage()}
          onEndReachedThreshold={0.5}
          refreshing={transactions.isRefetching && !transactions.isFetchingNextPage}
          onRefresh={() => transactions.refetch()}
          ListHeaderComponent={
            <View style={styles.header}>
              {range ? <Text variant="label">{range}</Text> : null}
              {total != null ? (
                <Text variant="caption" tone="muted">
                  {t('transactions.count', { count: total })}
                </Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={<EmptyState title={t('transactions.emptyTitle')} />}
          ListFooterComponent={transactions.isFetchingNextPage ? <ActivityIndicator style={styles.footer} /> : null}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: 2 },
  listContent: { paddingBottom: spacing.xxl },
  footer: { padding: spacing.lg },
})
