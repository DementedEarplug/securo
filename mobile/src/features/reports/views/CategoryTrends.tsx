import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import type { Report } from '@/api/types'
import { AmountText } from '@/components/AmountText'
import { Card } from '@/components/Card'
import { BarChart } from '@/components/charts/BarChart'
import { MultiSeriesChart } from '@/components/charts/MultiSeriesChart'
import { ListRow } from '@/components/ListRow'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Text } from '@/components/Text'
import { useDisplayFormat } from '@/features/session/hooks'
import { formatCurrency } from '@/lib/format'
import { radius, spacing, useColors } from '@/theme'
import { bucketLabel, bucketRange } from '../buckets'
import type { FlowGroup } from '../compare'
import { drillDown } from '../drilldown'
import { effectiveInterval, reportQuery, resolveRange, type ReportFilters } from '../filters'
import { useIncomeExpenses } from '../hooks'
import { GroupToggle, Legend, NoData, QueryGate } from './shared'

export const MAX_TREND_CATEGORIES = 5
const DEFAULT_TREND_CATEGORIES = 3
// The server folds categories past its top 11 into this one.
const OTHER_KEY = 'other'

type TrendItem = NonNullable<Report['category_trend']>[number]

/** The categories shown when nothing was picked: the biggest few, never "Other". */
export function defaultTrendKeys(items: TrendItem[]): string[] {
  return [...items]
    .filter((item) => item.key !== OTHER_KEY && item.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, DEFAULT_TREND_CATEGORIES)
    .map((item) => item.key)
}

/** Add or remove a category, keeping at least one and at most five. */
export function toggleTrendKey(keys: string[], key: string): string[] {
  if (keys.includes(key)) return keys.length > 1 ? keys.filter((k) => k !== key) : keys
  return keys.length >= MAX_TREND_CATEGORIES ? keys : [...keys, key]
}

export function CategoryTrends({ filters }: { filters: ReportFilters }) {
  const { t, i18n } = useTranslation()
  const { locale } = useDisplayFormat()
  const colors = useColors()
  const [group, setGroup] = useState<FlowGroup>('expenses')
  const [picked, setPicked] = useState<Record<FlowGroup, string[] | null>>({ expenses: null, income: null })
  const [mode, setMode] = useState<'bars' | 'lines'>('bars')
  const range = resolveRange(filters)
  const interval = effectiveInterval(filters, range)
  const report = useIncomeExpenses(reportQuery(filters))

  return (
    <View style={styles.root}>
      <GroupToggle value={group} onChange={setGroup} />
      <QueryGate queries={[report]}>
        {() => {
          const data = report.data!
          const currency = data.meta.currency
          const items = (data.category_trend ?? []).filter((item) => item.group === group && item.total > 0)
          if (!items.length) return <NoData />
          const keys = (picked[group] ?? defaultTrendKeys(items)).filter((k) => items.some((i) => i.key === k))
          const selected = keys.map((k) => items.find((i) => i.key === k)!)
          const buckets = selected[0]?.series.map((p) => p.date) ?? []
          const labels = buckets.map((b) => bucketLabel(b, interval, i18n.language))
          const drillKeys = keys.filter((k) => k !== OTHER_KEY)
          const type = group === 'expenses' ? 'debit' : 'credit'

          const openBucket = (index: number) => {
            if (!drillKeys.length) return
            const bucket = bucketRange(buckets[index]!, range)
            drillDown({
              title: drillKeys.length === 1 ? selected.find((s) => s.key === drillKeys[0])!.label : t('reports.trends.title'),
              ...bucket,
              accountIds: filters.accountIds,
              categoryIds: drillKeys,
              type,
            })
          }

          return (
            <>
              <View style={styles.chips}>
                {items.map((item) => {
                  const on = keys.includes(item.key)
                  return (
                    <Pressable
                      key={item.key}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={item.label}
                      onPress={() => setPicked((p) => ({ ...p, [group]: toggleTrendKey(keys, item.key) }))}
                      style={[
                        styles.chip,
                        { borderColor: on ? item.color : colors.border, backgroundColor: on ? colors.accent : colors.card },
                      ]}
                    >
                      <View style={[styles.dot, { backgroundColor: item.color }]} />
                      <Text variant="caption" numberOfLines={1}>
                        {item.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              <Text variant="caption" tone="muted">
                {t('reports.trends.pickHint', { max: MAX_TREND_CATEGORIES })}
              </Text>
              <Card>
                <SegmentedControl
                  options={[
                    { value: 'bars', label: t('reports.trends.bars') },
                    { value: 'lines', label: t('reports.trends.lines') },
                  ]}
                  value={mode}
                  onChange={setMode}
                />
                {mode === 'bars' || buckets.length < 2 ? (
                  <BarChart
                    stacked
                    groups={labels.map((label, i) => ({ label, values: selected.map((s) => s.series[i]?.value ?? 0) }))}
                    seriesColors={selected.map((s) => s.color)}
                    onPressGroup={drillKeys.length ? openBucket : undefined}
                    groupAccessibilityLabel={(g) =>
                      t('reports.trends.bucketA11y', {
                        label: g.label,
                        amount: formatCurrency(
                          g.values.reduce((sum, v) => sum + v, 0),
                          currency,
                          locale,
                        ),
                      })
                    }
                    accessibilityLabel={t('reports.trends.chartA11y', { names: selected.map((s) => s.label).join(', ') })}
                  />
                ) : (
                  <MultiSeriesChart
                    labels={labels}
                    stacked={false}
                    series={selected.map((s) => ({ key: s.key, name: s.label, color: s.color, values: s.series.map((p) => p.value) }))}
                    accessibilityLabel={t('reports.trends.chartA11y', { names: selected.map((s) => s.label).join(', ') })}
                  />
                )}
                {mode === 'bars' ? <Legend items={selected.map((s) => ({ key: s.key, label: s.label, color: s.color }))} /> : null}
              </Card>
              <Card style={styles.list}>
                {selected.map((s) => (
                  <ListRow
                    key={s.key}
                    title={s.label}
                    dotColor={s.color}
                    subtitle={t('reports.trends.average', {
                      amount: formatCurrency(s.total / Math.max(1, buckets.length), currency, locale),
                      interval: t(`reports.perInterval.${interval}`),
                    })}
                    trailing={<AmountText variant="label" value={s.total} currency={currency} />}
                    onPress={
                      s.key === OTHER_KEY
                        ? undefined
                        : () =>
                            drillDown({
                              title: s.label,
                              ...range,
                              accountIds: filters.accountIds,
                              categoryIds: [s.key],
                              type,
                            })
                    }
                  />
                ))}
              </Card>
            </>
          )
        }}
      </QueryGate>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    maxWidth: '100%',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  list: { padding: 0, overflow: 'hidden' },
})
