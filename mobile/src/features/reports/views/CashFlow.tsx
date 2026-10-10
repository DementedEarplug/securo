import { addDays } from 'date-fns'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { CategoryIcon } from '@/components/CategoryIcon'
import { LineChart } from '@/components/charts/LineChart'
import { ListRow } from '@/components/ListRow'
import { SectionHeader } from '@/components/SectionHeader'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { accountNameById, useAccounts } from '@/features/accounts/hooks'
import { useDisplayFormat } from '@/features/session/hooks'
import { formatDate, toIsoDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { spacing, useColors } from '@/theme'
import { bucketLabel, bucketRange, formatRange } from '../buckets'
import {
  CASH_FLOW_HORIZONS,
  CASH_FLOW_INTERVALS,
  cashFlowPoints,
  cashFlowTotals,
  lowestProjected,
  projectedAmount,
  todayIndex,
  upcomingFlows,
  type CashFlowHorizon,
  type CashFlowInterval,
  type CashFlowPoint,
} from '../cashflow'
import { useCashFlow, useProjectedTransactions } from '../cashflowHooks'
import { drillDown } from '../drilldown'
import type { ReportFilters } from '../filters'
import { NoData, QueryGate } from './shared'

/** How far ahead the upcoming list looks. */
const UPCOMING_DAYS = 30
const COLLAPSED_UPCOMING = 8

/**
 * Where the balance is heading: the last month of actual balances, then the
 * projection from recurring transactions (or, with the estimate on, from the
 * history average), like the web's Cash flow tab.
 */
export function CashFlow({ filters }: { filters: ReportFilters }) {
  const { t, i18n } = useTranslation()
  const { locale, dateLocale } = useDisplayFormat()
  const colors = useColors()
  const [months, setMonths] = useState<CashFlowHorizon>(6)
  const [interval, setInterval] = useState<CashFlowInterval>('daily')
  const [baseline, setBaseline] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const accountIds = filters.accountIds
  const report = useCashFlow({ months, interval, baseline, ...(accountIds.length ? { account_ids: accountIds } : {}) })
  const today = new Date()
  const todayIso = toIsoDate(today)
  const upcoming = useProjectedTransactions(toIsoDate(addDays(today, 1)), toIsoDate(addDays(today, UPCOMING_DAYS)))
  const accounts = useAccounts().data ?? []

  const changeMonths = (value: CashFlowHorizon) => {
    setMonths(value)
    setSelected(null)
  }
  const changeInterval = (value: CashFlowInterval) => {
    setInterval(value)
    setSelected(null)
  }

  return (
    <View style={styles.root}>
      <SegmentedControl
        options={CASH_FLOW_HORIZONS.map((m) => ({ value: String(m), label: t('reports.cashFlow.months', { count: m }) }))}
        value={String(months)}
        onChange={(value) => changeMonths(Number(value) as CashFlowHorizon)}
      />
      <SegmentedControl
        options={CASH_FLOW_INTERVALS.map((value) => ({ value, label: t(`reports.intervals.${value}`) }))}
        value={interval}
        onChange={changeInterval}
      />
      <SwitchField
        label={t('reports.cashFlow.estimate')}
        hint={t('reports.cashFlow.estimateHint')}
        value={baseline}
        onChange={(value) => {
          setBaseline(value)
          setSelected(null)
        }}
      />
      <QueryGate queries={[report]}>
        {() => {
          const data = report.data!
          const currency = data.meta.currency
          const points = cashFlowPoints(data)
          if (!points.length) return <NoData />
          const totals = cashFlowTotals(data)
          const now = todayIndex(points)
          const low = lowestProjected(points)
          const pick = selected != null ? points[selected] : undefined
          const label = (p: CashFlowPoint) => formatRange(bucketRange(p.date), dateLocale)

          return (
            <>
              <Card style={styles.list}>
                <ListRow
                  title={t('reports.cashFlow.today')}
                  trailing={<AmountText variant="label" value={totals.starting} currency={currency} />}
                />
                <ListRow
                  title={t('reports.cashFlow.projectedIn')}
                  trailing={<AmountText variant="label" tone="income" value={totals.projectedIncome} currency={currency} />}
                />
                <ListRow
                  title={t('reports.cashFlow.projectedOut')}
                  trailing={<AmountText variant="label" tone="expense" value={totals.projectedExpenses} currency={currency} />}
                />
                <ListRow
                  title={t('reports.cashFlow.ending', { count: months })}
                  subtitle={t('reports.cashFlow.change', {
                    amount: `${totals.change >= 0 ? '+' : '−'}${formatCurrency(Math.abs(totals.change), currency, locale)}`,
                    percent: totals.changePercent == null ? '' : ` (${totals.changePercent >= 0 ? '+' : '−'}${Math.abs(totals.changePercent).toFixed(1)}%)`,
                  })}
                  trailing={
                    <AmountText variant="label" value={totals.ending} currency={currency} tone={totals.ending < 0 ? 'expense' : 'default'} />
                  }
                />
              </Card>

              <Card>
                <Text variant="label" tone="muted">
                  {data.meta.baseline_active ? t('reports.cashFlow.forecastEstimate') : t('reports.cashFlow.forecast')}
                </Text>
                <LineChart
                  points={points.map((p) => ({ label: bucketLabel(p.date, interval, i18n.language), value: p.balance }))}
                  forecastFrom={now}
                  selectedIndex={selected}
                  onPressPoint={(index) => setSelected((current) => (current === index ? null : index))}
                  accessibilityLabel={t('reports.cashFlow.chartA11y', {
                    today: formatCurrency(totals.starting, currency, locale),
                    ending: formatCurrency(totals.ending, currency, locale),
                    months,
                  })}
                />
                <View style={styles.key}>
                  <View style={[styles.solid, { backgroundColor: colors.primary }]} />
                  <Text variant="caption" tone="muted">
                    {t('reports.cashFlow.actual')}
                  </Text>
                  <View style={[styles.dashed, { borderColor: colors.primary }]} />
                  <Text variant="caption" tone="muted">
                    {t('reports.cashFlow.projected')}
                  </Text>
                </View>
                {pick ? (
                  <View style={[styles.detail, { borderTopColor: colors.border }]}>
                    <Text variant="label">
                      {label(pick)}
                      {pick.forecast ? ` · ${t('reports.cashFlow.projected')}` : ''}
                    </Text>
                    <View style={styles.detailRow}>
                      <Text tone="muted">{t('reports.cashFlow.balance')}</Text>
                      <AmountText variant="label" value={pick.balance} currency={currency} tone={pick.balance < 0 ? 'expense' : 'default'} />
                    </View>
                    <View style={styles.detailRow}>
                      <Text tone="muted">{t('reports.cashFlow.in')}</Text>
                      <AmountText variant="label" tone="income" value={pick.inflow} currency={currency} />
                    </View>
                    <View style={styles.detailRow}>
                      <Text tone="muted">{t('reports.cashFlow.out')}</Text>
                      <AmountText variant="label" tone="expense" value={pick.outflow} currency={currency} />
                    </View>
                    {pick.forecast ? null : (
                      <Button
                        variant="secondary"
                        label={t('reports.cashFlow.seeTransactions')}
                        onPress={() => {
                          // Today's bucket can reach into the future; only booked days have transactions.
                          const span = bucketRange(pick.date, { from: '0000-01-01', to: todayIso })
                          drillDown({ title: formatRange(span, dateLocale), ...span, accountIds })
                        }}
                      />
                    )}
                  </View>
                ) : (
                  <Text variant="caption" tone="muted">
                    {t('reports.cashFlow.tapHint')}
                  </Text>
                )}
              </Card>

              {low ? (
                <Text variant="caption" tone={low.balance < 0 ? 'expense' : 'muted'}>
                  {t(low.balance < 0 ? 'reports.cashFlow.lowestNegative' : 'reports.cashFlow.lowest', {
                    amount: formatCurrency(low.balance, currency, locale),
                    date: label(low),
                  })}
                </Text>
              ) : null}
            </>
          )
        }}
      </QueryGate>

      <SectionHeader title={t('reports.cashFlow.upcoming', { days: UPCOMING_DAYS })} />
      <QueryGate queries={[upcoming]}>
        {() => {
          const items = upcomingFlows(upcoming.data!, accountIds)
          if (!items.length) {
            return (
              <Text variant="caption" tone="muted">
                {t('reports.cashFlow.noUpcoming')}
              </Text>
            )
          }
          const shown = showAll ? items : items.slice(0, COLLAPSED_UPCOMING)
          const currency = report.data?.meta.currency
          return (
            <>
              <Card style={styles.list}>
                {shown.map((item, index) => {
                  const amount = projectedAmount(item)
                  return (
                    <ListRow
                      key={`${item.recurring_id}-${item.date}-${index}`}
                      leading={<CategoryIcon icon={item.category_icon} color={item.category_color} size="sm" />}
                      title={item.description}
                      subtitle={[formatDate(item.date, dateLocale), item.category_name, accountNameById(accounts, item.account_id)]
                        .filter(Boolean)
                        .join(' · ')}
                      trailing={
                        <AmountText
                          variant="label"
                          value={amount}
                          currency={item.amount_primary != null && currency ? currency : item.currency}
                          tone={amount >= 0 ? 'income' : 'expense'}
                        />
                      }
                    />
                  )
                })}
              </Card>
              {items.length > COLLAPSED_UPCOMING ? (
                <Button
                  variant="secondary"
                  label={showAll ? t('reports.compare.showLess') : t('reports.compare.showAll', { count: items.length })}
                  onPress={() => setShowAll((v) => !v)}
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
  key: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  solid: { width: 16, height: 3, borderRadius: 2 },
  dashed: { width: 16, height: 0, borderTopWidth: 2, borderStyle: 'dashed', marginLeft: spacing.md },
  detail: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, gap: spacing.xs },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
})
