import { router, useNavigation } from 'expo-router'
import Download from 'lucide-react-native/icons/download'
import { useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native'

import { Icon } from '@/components/Icon'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { csvExportPath } from '@/features/data/export'
import { useCanWrite } from '@/features/session/hooks'
import { FiltersSheet } from '@/features/transactions/FiltersSheet'
import { activeFilterCount, NO_FILTERS, toQuery, type FilterState } from '@/features/transactions/filters'
import { useTransactions } from '@/features/transactions/hooks'
import { TransactionRow } from '@/features/transactions/TransactionRow'
import { showError } from '@/lib/confirm'
import { toIsoDate } from '@/lib/dates'
import { downloadToCache, shareFile } from '@/lib/download'
import { errorMessage } from '@/lib/errors'
import { useDebounced } from '@/lib/use-debounced'
import { font, radius, spacing, useColors } from '@/theme'

export default function TransactionsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const navigation = useNavigation()
  const canWrite = useCanWrite()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterState>(NO_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [exporting, setExporting] = useState(false)
  const q = useDebounced(search)
  const query = toQuery(filters, q)
  const transactions = useTransactions(query)
  const active = activeFilterCount(filters)

  const exportPath = csvExportPath(query)

  useLayoutEffect(() => {
    // Export exactly what the list shows (search and filters) as CSV.
    const exportRows = async () => {
      setExporting(true)
      try {
        const { file, mimeType } = await downloadToCache(exportPath, `transactions-${toIsoDate(new Date())}.csv`)
        await shareFile(file, mimeType ?? 'text/csv', t('transactions.exportRows'))
      } catch (e) {
        showError(errorMessage(e, t))
      } finally {
        setExporting(false)
      }
    }
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('transactions.exportRows')}
            accessibilityState={{ busy: exporting }}
            disabled={exporting}
            onPress={() => void exportRows()}
            hitSlop={12}
          >
            {exporting ? <ActivityIndicator color={colors.primary} /> : <Download size={22} color={colors.foreground} />}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={active ? t('transactions.filters.titleActive', { count: active }) : t('transactions.filters.title')}
            onPress={() => setShowFilters(true)}
            hitSlop={12}
            style={styles.headerButton}
          >
            <Icon name="filter" color={active ? colors.primary : colors.foreground} />
            {active ? <Text variant="caption" tone="primary">{active}</Text> : null}
          </Pressable>
        </View>
      ),
    })
  }, [navigation, active, colors, t, exporting, exportPath])

  const items = transactions.data?.pages.flatMap((page) => page.items) ?? []
  const total = transactions.data?.pages[0]?.total

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('transactions.searchPlaceholder')}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={t('common.search')}
        returnKeyType="search"
        style={[styles.search, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
      />
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
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            total != null ? (
              <Text variant="caption" tone="muted" style={styles.count}>
                {t('transactions.count', { count: total })}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              title={t('transactions.emptyTitle')}
              body={q || active ? t('transactions.emptyFiltered') : undefined}
            />
          }
          ListFooterComponent={transactions.isFetchingNextPage ? <ActivityIndicator style={styles.footer} /> : null}
          contentContainerStyle={styles.listContent}
        />
      )}
      {canWrite ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('transactions.newTitle')}
          onPress={() => router.push('/transaction/new')}
          style={[styles.fab, { backgroundColor: colors.primary }]}
        >
          <Icon name="plus" color={colors.primaryForeground} size={28} />
        </Pressable>
      ) : null}
      <FiltersSheet
        visible={showFilters}
        value={filters}
        onApply={(next) => {
          setFilters(next)
          setShowFilters(false)
        }}
        onClose={() => setShowFilters(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  search: {
    margin: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: font.md,
  },
  count: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  listContent: { paddingBottom: 96 },
  footer: { padding: spacing.lg },
  headerButtons: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg },
  headerButton: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: spacing.lg },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
})
