import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Text } from '@/components/Text'
import { useDisplayFormat } from '@/features/session/hooks'
import { formatCurrency } from '@/lib/format'
import { spacing, useColors } from '@/theme'
import { formatRange } from '../buckets'
import { comparePeriods, type Delta, type FlowGroup } from '../compare'
import { drillDown } from '../drilldown'
import { previousRange, rangeQuery, resolveRange, type ComparisonMode, type ReportFilters } from '../filters'
import { useIncomeExpenses } from '../hooks'
import { DeltaText, GroupToggle, NoData, QueryGate } from './shared'

const COLLAPSED_ROWS = 12

export function PeriodComparison({ filters }: { filters: ReportFilters }) {
  const { t } = useTranslation()
  const { locale, dateLocale } = useDisplayFormat()
  const colors = useColors()
  const [mode, setMode] = useState<ComparisonMode>('previous')
  const [group, setGroup] = useState<FlowGroup>('expenses')
  const [expanded, setExpanded] = useState(false)
  const range = resolveRange(filters)
  const before = previousRange(range, mode)
  // Only totals and categories are compared, so monthly buckets keep the payload small.
  const current = useIncomeExpenses(rangeQuery(range, 'monthly', filters.accountIds))
  const previous = useIncomeExpenses(rangeQuery(before, 'monthly', filters.accountIds))

  return (
    <View style={styles.root}>
      <SegmentedControl
        options={[
          { value: 'previous', label: t('reports.compare.previous') },
          { value: 'lastYear', label: t('reports.compare.lastYear') },
        ]}
        value={mode}
        onChange={setMode}
      />
      <Text variant="caption" tone="muted">
        {t('reports.compare.versus', { current: formatRange(range, dateLocale), previous: formatRange(before, dateLocale) })}
      </Text>
      <QueryGate queries={[current, previous]}>
        {() => {
          const currency = current.data!.meta.currency
          const result = comparePeriods(current.data!, previous.data!, group)
          const totalRow = (label: string, value: Delta, goodWhenUp: boolean, type?: 'debit' | 'credit') => (
            <ListRow
              title={label}
              subtitle={t('reports.compare.was', { amount: formatCurrency(value.previous, currency, locale) })}
              trailing={
                <View style={styles.trailing}>
                  <AmountText variant="label" value={value.current} currency={currency} />
                  <DeltaText value={value} currency={currency} goodWhenUp={goodWhenUp} />
                </View>
              }
              onPress={
                type
                  ? () => drillDown({ title: label, ...range, accountIds: filters.accountIds, type })
                  : undefined
              }
            />
          )
          const rows = expanded ? result.categories : result.categories.slice(0, COLLAPSED_ROWS)
          return (
            <>
              <Card style={styles.list}>
                {totalRow(t('reports.income'), result.income, true, 'credit')}
                {totalRow(t('reports.spending'), result.expenses, false, 'debit')}
                {totalRow(t('reports.net'), result.net, true)}
              </Card>
              <GroupToggle value={group} onChange={setGroup} />
              {result.categories.length === 0 ? (
                <NoData />
              ) : (
                <Card style={styles.list}>
                  <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}>
                    <Text variant="caption" tone="muted" style={styles.flex}>
                      {t('reports.compare.category')}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {t('reports.compare.change')}
                    </Text>
                  </View>
                  {rows.map((row) => (
                    <ListRow
                      key={row.key}
                      title={row.label}
                      dotColor={row.color}
                      subtitle={t('reports.compare.nowWas', {
                        now: formatCurrency(row.current, currency, locale),
                        was: formatCurrency(row.previous, currency, locale),
                      })}
                      trailing={<DeltaText value={row} currency={currency} goodWhenUp={group === 'income'} variant="label" />}
                      onPress={
                        row.key === 'other'
                          ? undefined
                          : () =>
                              drillDown({
                                title: row.label,
                                ...range,
                                accountIds: filters.accountIds,
                                categoryIds: [row.key],
                                type: group === 'expenses' ? 'debit' : 'credit',
                              })
                      }
                    />
                  ))}
                </Card>
              )}
              {result.categories.length > COLLAPSED_ROWS ? (
                <Button
                  variant="secondary"
                  label={expanded ? t('reports.compare.showLess') : t('reports.compare.showAll', { count: result.categories.length })}
                  onPress={() => setExpanded((e) => !e)}
                />
              ) : null}
            </>
          )
        }}
      </QueryGate>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  list: { padding: 0, overflow: 'hidden' },
  trailing: { alignItems: 'flex-end', gap: 2 },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
})
