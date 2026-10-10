import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { EmptyState, ErrorState, Loading } from '@/components/States'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Text } from '@/components/Text'
import { useAllCategories } from '@/features/categories/hooks'
import { useDisplayFormat } from '@/features/session/hooks'
import { formatCurrency } from '@/lib/format'
import { spacing } from '@/theme'
import type { Delta, FlowGroup } from '../compare'

/** Loading / error / content for one or more queries. */
export function QueryGate({
  queries,
  children,
}: {
  queries: UseQueryResult<unknown, Error>[]
  children: () => ReactNode
}) {
  const failed = queries.find((q) => q.isError)
  if (failed) return <ErrorState error={failed.error} onRetry={() => queries.forEach((q) => void q.refetch())} />
  if (queries.some((q) => q.isPending)) return <Loading />
  return <>{children()}</>
}

export function NoData({ body }: { body?: string }) {
  const { t } = useTranslation()
  return <EmptyState title={t('reports.noData')} body={body ?? t('reports.noDataBody')} />
}

/** Spending vs income switch used by the category reports. */
export function GroupToggle({ value, onChange }: { value: FlowGroup; onChange: (group: FlowGroup) => void }) {
  const { t } = useTranslation()
  return (
    <SegmentedControl
      options={[
        { value: 'expenses', label: t('reports.spending') },
        { value: 'income', label: t('reports.income') },
      ]}
      value={value}
      onChange={onChange}
    />
  )
}

/**
 * "▲ $120.00 (12.5%)" for a change. `goodWhenUp` colours a rise green
 * (income, net) or red (spending).
 */
export function DeltaText({
  value,
  currency,
  goodWhenUp,
  variant = 'caption',
}: {
  value: Delta
  currency: string
  goodWhenUp: boolean
  variant?: 'caption' | 'label'
}) {
  const { t } = useTranslation()
  const { locale } = useDisplayFormat()
  if (value.change === 0) {
    return (
      <Text variant={variant} tone="muted">
        {t('reports.compare.noChange')}
      </Text>
    )
  }
  const up = value.change > 0
  const good = up === goodWhenUp
  const amount = formatCurrency(Math.abs(value.change), currency, locale)
  const percent = value.percent == null ? t('reports.compare.new') : `${Math.abs(value.percent).toFixed(1)}%`
  return (
    <Text
      variant={variant}
      tone={good ? 'income' : 'expense'}
      accessibilityLabel={t(up ? 'reports.compare.upA11y' : 'reports.compare.downA11y', { amount, percent })}
    >
      {`${up ? '▲' : '▼'} ${amount} (${percent})`}
    </Text>
  )
}

/** Colour swatches with names, for multi-series charts. */
export function Legend({ items }: { items: { key: string; label: string; color: string }[] }) {
  return (
    <View style={styles.legend} importantForAccessibility="no-hide-descendants">
      {items.map((item) => (
        <View key={item.key} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: item.color }]} />
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** Category icons by id, for rows built from report keys. */
export function useCategoryIcons(): Map<string, string | null> {
  const categories = useAllCategories().data ?? []
  return new Map(categories.map((c) => [c.id, c.icon ?? null]))
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '100%' },
  swatch: { width: 10, height: 10, borderRadius: 2 },
})
