import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Card } from '@/components/Card'
import { BarChart } from '@/components/charts/BarChart'
import { ListRow } from '@/components/ListRow'
import { SectionHeader } from '@/components/SectionHeader'
import { Text } from '@/components/Text'
import { useDisplayFormat } from '@/features/session/hooks'
import { formatCurrency } from '@/lib/format'
import { spacing, useColors } from '@/theme'
import { bucketLabel, bucketRange, formatRange } from '../buckets'
import { flowBuckets, flowSummary, type SavingsRateChange } from '../cashflow'
import { drillDown } from '../drilldown'
import { effectiveInterval, previousRange, rangeQuery, reportQuery, resolveRange, type ReportFilters } from '../filters'
import { useIncomeExpenses } from '../hooks'
import { DeltaText, Legend, NoData, QueryGate } from './shared'

/** "42.5%", or a dash without income. */
function formatRate(rate: number | null): string {
  return rate == null ? '—' : `${rate.toFixed(1)}%`
}

/** Income, spending, net and savings rate over a range, by day, week, month or year. */
export function IncomeExpenses({ filters }: { filters: ReportFilters }) {
  const { t, i18n } = useTranslation()
  const { locale, dateLocale } = useDisplayFormat()
  const colors = useColors()
  const range = resolveRange(filters)
  const interval = effectiveInterval(filters, range)
  const report = useIncomeExpenses(reportQuery(filters))
  // Totals only, so monthly buckets keep the comparison light.
  const before = previousRange(range, 'previous')
  const previous = useIncomeExpenses(rangeQuery(before, 'monthly', filters.accountIds))

  return (
    <View style={styles.root}>
      <QueryGate queries={[report]}>
        {() => {
          const data = report.data!
          const currency = data.meta.currency
          const summary = flowSummary(data, previous.data)
          const buckets = flowBuckets(data)
          const hasPrevious = Boolean(previous.data)
          if (!buckets.length && summary.income.current === 0 && summary.expenses.current === 0) return <NoData />

          const openBucket = (index: number, type?: 'debit' | 'credit') => {
            const bucket = buckets[index]
            if (!bucket) return
            const span = bucketRange(bucket.date, range)
            drillDown({ title: formatRange(span, dateLocale), ...span, accountIds: filters.accountIds, type })
          }
          const totalRow = (label: string, value: typeof summary.income, goodWhenUp: boolean, type?: 'debit' | 'credit') => (
            <ListRow
              title={label}
              subtitle={hasPrevious ? t('reports.compare.was', { amount: formatCurrency(value.previous, currency, locale) }) : null}
              trailing={
                <View style={styles.trailing}>
                  <AmountText
                    variant="label"
                    value={value.current}
                    currency={currency}
                    tone={type === 'credit' ? 'income' : type === 'debit' ? 'expense' : value.current < 0 ? 'expense' : 'default'}
                  />
                  {hasPrevious ? <DeltaText value={value} currency={currency} goodWhenUp={goodWhenUp} /> : null}
                </View>
              }
              onPress={type ? () => drillDown({ title: label, ...range, accountIds: filters.accountIds, type }) : undefined}
            />
          )

          return (
            <>
              <Text variant="caption" tone="muted">
                {t('reports.incomeExpenses.versus', { previous: formatRange(before, dateLocale) })}
              </Text>
              <Card style={styles.list}>
                {totalRow(t('reports.income'), summary.income, true, 'credit')}
                {totalRow(t('reports.spending'), summary.expenses, false, 'debit')}
                {totalRow(t('reports.net'), summary.net, true)}
                <SavingsRateRow rate={summary.savingsRate} showChange={hasPrevious} />
              </Card>

              {buckets.length ? (
                <Card>
                  <Legend
                    items={[
                      { key: 'income', label: t('reports.income'), color: colors.income },
                      { key: 'expenses', label: t('reports.spending'), color: colors.expense },
                    ]}
                  />
                  <BarChart
                    groups={buckets.map((b) => ({ label: bucketLabel(b.date, interval, i18n.language), values: [b.income, b.expenses] }))}
                    seriesColors={[colors.income, colors.expense]}
                    onPressGroup={(index) => openBucket(index)}
                    groupAccessibilityLabel={(_, index) => {
                      const b = buckets[index]!
                      return t('reports.incomeExpenses.bucketA11y', {
                        label: formatRange(bucketRange(b.date, range), dateLocale),
                        income: formatCurrency(b.income, currency, locale),
                        expenses: formatCurrency(b.expenses, currency, locale),
                        rate: formatRate(b.savingsRate),
                      })
                    }}
                    accessibilityLabel={t('reports.incomeExpenses.chartA11y', {
                      income: formatCurrency(summary.income.current, currency, locale),
                      expenses: formatCurrency(summary.expenses.current, currency, locale),
                    })}
                  />
                  <Text variant="caption" tone="muted">
                    {t('reports.incomeExpenses.tapHint')}
                  </Text>
                </Card>
              ) : null}

              {buckets.length > 1 ? (
                <>
                  <SectionHeader title={t('reports.incomeExpenses.byPeriod')} />
                  <Card style={styles.list}>
                    {buckets
                      .map((b, index) => ({ b, index }))
                      .reverse()
                      .map(({ b, index }) => (
                        <ListRow
                          key={b.date}
                          title={formatRange(bucketRange(b.date, range), dateLocale)}
                          subtitle={t('reports.incomeExpenses.periodLine', {
                            income: formatCurrency(b.income, currency, locale),
                            expenses: formatCurrency(b.expenses, currency, locale),
                          })}
                          trailing={
                            <View style={styles.trailing}>
                              <AmountText variant="label" value={b.net} currency={currency} tone={b.net < 0 ? 'expense' : 'income'} />
                              <Text variant="caption" tone="muted">
                                {t('reports.incomeExpenses.saved', { rate: formatRate(b.savingsRate) })}
                              </Text>
                            </View>
                          }
                          onPress={() => openBucket(index)}
                        />
                      ))}
                  </Card>
                </>
              ) : null}
            </>
          )
        }}
      </QueryGate>
    </View>
  )
}

/** Savings rate now, and how many points it moved since the previous period. */
function SavingsRateRow({ rate, showChange }: { rate: SavingsRateChange; showChange: boolean }) {
  const { t } = useTranslation()
  const up = rate.points != null && rate.points > 0
  const change =
    rate.points == null
      ? null
      : rate.points === 0
        ? t('reports.compare.noChange')
        : t('reports.incomeExpenses.points', { sign: up ? '▲' : '▼', points: Math.abs(rate.points).toFixed(1) })
  return (
    <ListRow
      title={t('reports.incomeExpenses.savingsRate')}
      subtitle={rate.current == null ? t('reports.incomeExpenses.noIncome') : t('reports.incomeExpenses.savingsRateHint')}
      trailing={
        <View style={styles.trailing}>
          <Text variant="label" tone={rate.current == null ? 'muted' : rate.current < 0 ? 'expense' : 'default'}>
            {formatRate(rate.current)}
          </Text>
          {showChange && change ? (
            <Text variant="caption" tone={rate.points == null || rate.points === 0 ? 'muted' : up ? 'income' : 'expense'}>
              {change}
            </Text>
          ) : null}
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  list: { padding: 0, overflow: 'hidden' },
  trailing: { alignItems: 'flex-end', gap: 2 },
})
