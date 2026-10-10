import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'
import { AmountText } from '@/components/AmountText'
import { Card } from '@/components/Card'
import { MultiSeriesChart } from '@/components/charts/MultiSeriesChart'
import { Icon } from '@/components/Icon'
import { ListRow } from '@/components/ListRow'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Text } from '@/components/Text'
import { useDashboardSummary } from '@/features/accounts/hooks'
import { useDisplayFormat, useWorkspaceKey } from '@/features/session/hooks'
import { formatMonth, toMonth } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { spacing, useColors } from '@/theme'
import { drillDown } from '../drilldown'
import { rangeQuery, type ReportFilters } from '../filters'
import { useIncomeExpenses } from '../hooks'
import { cumulativeDaily, dayLabels, knownBalances, monthWindow, nextMonth, onPace, previousMonth } from '../monthly'
import { DeltaText, QueryGate } from './shared'

type Mode = 'spending' | 'balance'
type BalanceHistory = components['schemas']['BalanceHistory']

/** Daily balances for a month and the month before it (the web dashboard's "balance flow"). */
function useBalanceHistory(month: string, accountIds: string[], enabled: boolean) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'dashboard', 'balance-history', month, accountIds],
    queryFn: () =>
      unwrap<BalanceHistory>(
        api().GET('/api/dashboard/balance-history', {
          params: { query: { month: `${month}-01`, ...(accountIds.length ? { account_ids: accountIds } : {}) } },
        }),
      ),
    enabled,
  })
}

/**
 * This month against last month, day by day: cumulative spending (or the
 * running balance) on the same day axis, and whether you're ahead of last
 * month's pace.
 */
export function MonthVsLast({ filters }: { filters: ReportFilters }) {
  const { t, i18n } = useTranslation()
  const colors = useColors()
  const { locale, currency: displayCurrency } = useDisplayFormat()
  // Balance history is in the user's primary currency, which the response doesn't name.
  const mainCurrency = useDashboardSummary().data?.primary_currency ?? displayCurrency
  const [month, setMonth] = useState(() => toMonth(new Date()))
  const [mode, setMode] = useState<Mode>('spending')
  const current = monthWindow(month)
  const previous = monthWindow(previousMonth(month))
  const next = nextMonth(month)
  const accountIds = filters.accountIds

  const spentNow = useIncomeExpenses(rangeQuery(current.elapsed, 'daily', accountIds), { enabled: mode === 'spending' })
  const spentBefore = useIncomeExpenses(rangeQuery(previous.full, 'daily', accountIds), { enabled: mode === 'spending' })
  const balances = useBalanceHistory(month, accountIds, mode === 'balance')

  const monthName = formatMonth(month, i18n.language)
  const previousName = formatMonth(previous.month, i18n.language)

  return (
    <View style={styles.root}>
      <View style={styles.monthNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('reports.monthVsLast.previousMonth')}
          onPress={() => setMonth(previous.month)}
          hitSlop={12}
        >
          <Icon name="chevron-left" color={colors.foreground} />
        </Pressable>
        <Text variant="heading" accessibilityRole="header">
          {monthName}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('reports.monthVsLast.nextMonth')}
          accessibilityState={{ disabled: !next }}
          disabled={!next}
          onPress={() => next && setMonth(next)}
          hitSlop={12}
        >
          <Icon name="chevron-right" color={next ? colors.foreground : colors.border} />
        </Pressable>
      </View>
      <SegmentedControl
        options={[
          { value: 'spending', label: t('reports.monthVsLast.spending') },
          { value: 'balance', label: t('reports.monthVsLast.balance') },
        ]}
        value={mode}
        onChange={setMode}
      />
      <QueryGate queries={mode === 'spending' ? [spentNow, spentBefore] : [balances]}>
        {() => {
          let now: number[]
          let before: number[]
          let currency = mainCurrency
          if (mode === 'spending') {
            now = cumulativeDaily(spentNow.data!, current.elapsed)
            before = cumulativeDaily(spentBefore.data!, previous.full)
            currency = spentNow.data!.meta.currency
          } else {
            now = knownBalances(balances.data!.current)
            before = knownBalances(balances.data!.previous)
          }
          const day = Math.min(current.cutoffDay, now.length || current.cutoffDay)
          const pace = onPace(now, before, day)
          const lastMonthTotal = before.at(-1) ?? 0
          const spending = mode === 'spending'
          return (
            <>
              <Card style={styles.card}>
                <Text variant="label" tone="muted">
                  {spending
                    ? current.isCurrent
                      ? t('reports.monthVsLast.spentSoFar')
                      : t('reports.monthVsLast.spentIn', { month: monthName })
                    : current.isCurrent
                      ? t('reports.monthVsLast.balanceToday')
                      : t('reports.monthVsLast.balanceEnd', { month: monthName })}
                </Text>
                <AmountText variant="title" value={now.at(-1) ?? 0} currency={currency} />
                {pace ? (
                  <View style={styles.paceRow}>
                    <DeltaText value={pace} currency={currency} goodWhenUp={!spending} />
                    <Text variant="caption" tone="muted">
                      {current.isCurrent
                        ? t('reports.monthVsLast.vsSameDay', { day })
                        : t('reports.monthVsLast.vsMonth', { month: previousName })}
                    </Text>
                  </View>
                ) : null}
                {spending && current.isCurrent && pace ? (
                  <Text variant="caption" tone="muted">
                    {t('reports.monthVsLast.lastMonthTotal', {
                      month: previousName,
                      amount: formatCurrency(lastMonthTotal, currency, locale),
                    })}
                  </Text>
                ) : null}
              </Card>
              <Card style={styles.card}>
                <MultiSeriesChart
                  labels={dayLabels(current.days, previous.days)}
                  series={[
                    { key: 'previous', name: previousName, color: colors.mutedForeground, values: before },
                    { key: 'current', name: monthName, color: colors.primary, values: now },
                  ]}
                  stacked={false}
                  accessibilityLabel={t(spending ? 'reports.monthVsLast.spendingA11y' : 'reports.monthVsLast.balanceA11y', {
                    month: monthName,
                    previous: previousName,
                    now: formatCurrency(now.at(-1) ?? 0, currency, locale),
                    before: formatCurrency(pace?.previous ?? lastMonthTotal, currency, locale),
                    day,
                  })}
                />
                <Text variant="caption" tone="muted">
                  {spending ? t('reports.monthVsLast.spendingHint') : t('reports.monthVsLast.balanceHint')}
                </Text>
              </Card>
              {spending ? (
                <Card style={styles.list}>
                  <ListRow
                    title={t('reports.monthVsLast.seeSpending', { month: monthName })}
                    onPress={() =>
                      drillDown({ title: t('reports.monthVsLast.spendingTitle', { month: monthName }), ...current.elapsed, accountIds, type: 'debit' })
                    }
                    showChevron
                  />
                  <ListRow
                    title={t('reports.monthVsLast.seeSpending', { month: previousName })}
                    onPress={() =>
                      drillDown({ title: t('reports.monthVsLast.spendingTitle', { month: previousName }), ...previous.full, accountIds, type: 'debit' })
                    }
                    showChevron
                  />
                </Card>
              ) : null}
            </>
          )
        }}
      </QueryGate>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: { gap: spacing.sm },
  paceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  list: { padding: 0, overflow: 'hidden' },
})
