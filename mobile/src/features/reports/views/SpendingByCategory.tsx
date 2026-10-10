import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Card } from '@/components/Card'
import { CategoryIcon } from '@/components/CategoryIcon'
import { DonutChart, type DonutSlice } from '@/components/charts/DonutChart'
import { ListRow } from '@/components/ListRow'
import { Text } from '@/components/Text'
import { useDisplayFormat } from '@/features/session/hooks'
import { formatCurrency } from '@/lib/format'
import { spacing } from '@/theme'
import { groupComposition, type FlowGroup } from '../compare'
import { drillDown } from '../drilldown'
import { reportQuery, resolveRange, type ReportFilters } from '../filters'
import { useIncomeExpenses } from '../hooks'
import { GroupToggle, NoData, QueryGate, useCategoryIcons } from './shared'

/** Slices drawn individually; the rest share one "Other" slice (the list still shows all). */
export const DONUT_SLICES = 7
const REST_KEY = '__rest'

export interface CategoryShare {
  key: string
  label: string
  color: string
  value: number
  share: number
}

/** Categories of one side of a report, largest first, with their share of the total. */
export function categoryShares(items: { key: string; label: string; color: string; value: number }[]): CategoryShare[] {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  return [...items]
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .map((item) => ({ ...item, share: total ? item.value / total : 0 }))
}

/** Donut slices: the biggest categories, then everything else as one slice. */
export function donutSlices(shares: CategoryShare[], otherLabel: string, otherColor: string): DonutSlice[] {
  const top = shares.slice(0, DONUT_SLICES)
  const rest = shares.slice(DONUT_SLICES)
  const slices: DonutSlice[] = top.map(({ key, label, color, value }) => ({ key, label, color, value }))
  if (rest.length) {
    slices.push({ key: REST_KEY, label: otherLabel, color: otherColor, value: rest.reduce((sum, s) => sum + s.value, 0) })
  }
  return slices
}

export function SpendingByCategory({ filters }: { filters: ReportFilters }) {
  const { t } = useTranslation()
  const { locale } = useDisplayFormat()
  const [group, setGroup] = useState<FlowGroup>('expenses')
  const range = resolveRange(filters)
  const report = useIncomeExpenses(reportQuery(filters))
  const icons = useCategoryIcons()

  const open = (key: string, label: string) =>
    drillDown({
      title: label,
      from: range.from,
      to: range.to,
      accountIds: filters.accountIds,
      categoryIds: [key],
      type: group === 'expenses' ? 'debit' : 'credit',
    })

  return (
    <View style={styles.root}>
      <GroupToggle value={group} onChange={setGroup} />
      <QueryGate queries={[report]}>
        {() => {
          const data = report.data!
          const currency = data.meta.currency
          const shares = categoryShares(groupComposition(data, group))
          if (!shares.length) return <NoData />
          const total = shares.reduce((sum, s) => sum + s.value, 0)
          const slices = donutSlices(shares, t('reports.other'), '#94A3B8')
          return (
            <>
              <Card>
                <DonutChart
                  slices={slices}
                  centerValue={formatCurrency(total, currency, locale)}
                  centerLabel={group === 'expenses' ? t('reports.totalSpent') : t('reports.totalEarned')}
                  onPressSlice={(key) => {
                    const slice = shares.find((s) => s.key === key)
                    if (slice) open(slice.key, slice.label)
                  }}
                  accessibilityLabel={t('reports.byCategory.chartA11y', {
                    total: formatCurrency(total, currency, locale),
                    top: shares
                      .slice(0, 3)
                      .map((s) => `${s.label} ${Math.round(s.share * 100)}%`)
                      .join(', '),
                  })}
                />
              </Card>
              <Card style={styles.list}>
                {shares.map((s) => (
                  <ListRow
                    key={s.key}
                    title={s.label}
                    subtitle={`${(s.share * 100).toFixed(1)}%`}
                    leading={<CategoryIcon icon={icons.get(s.key) ?? null} color={s.color} size="sm" />}
                    trailing={<AmountText variant="label" value={s.value} currency={currency} />}
                    onPress={() => open(s.key, s.label)}
                    accessibilityLabel={t('reports.byCategory.rowA11y', {
                      name: s.label,
                      amount: formatCurrency(s.value, currency, locale),
                      percent: (s.share * 100).toFixed(1),
                    })}
                  />
                ))}
              </Card>
              <Text variant="caption" tone="muted">
                {t('reports.tapForTransactions')}
              </Text>
            </>
          )
        }}
      </QueryGate>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  list: { padding: 0, overflow: 'hidden' },
})
