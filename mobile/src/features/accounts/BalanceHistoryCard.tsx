import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { api, unwrap, unwrapAs } from '@/api/client'
import type { Account, Transaction } from '@/api/types'
import { AmountText } from '@/components/AmountText'
import { LineChart } from '@/components/charts/LineChart'
import { SegmentedControl } from '@/components/SegmentedControl'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { formatRange } from '@/features/reports/buckets'
import { rangeQuery } from '@/features/reports/filters'
import { useIncomeExpenses } from '@/features/reports/hooks'
import { cumulativeDaily } from '@/features/reports/monthly'
import { useDisplayFormat, useWorkspaceKey } from '@/features/session/hooks'
import { fromIsoDate, toIsoDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { radius, spacing, useColors } from '@/theme'
import { accountBalance } from './hooks'
import { alignSign, cycleBounds, downsample, HISTORY_RANGES, historyRange, type BalancePoint, type HistoryRange } from './balance-history'

const CHART_POINTS = 60

function useBalanceSeries(accountId: string, range: { from: string; to: string }, enabled: boolean) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'accounts', accountId, 'balance-history', range],
    queryFn: () =>
      unwrapAs<BalancePoint[]>(
        api().GET('/api/accounts/{account_id}/balance-history', {
          params: { path: { account_id: accountId }, query: { from: range.from, to: range.to } },
        }),
      ),
    enabled,
  })
}

/** The account's oldest transaction date, for the "All" range. */
function useFirstTransactionDate(accountId: string, enabled: boolean) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'accounts', accountId, 'first-transaction'],
    queryFn: async () => {
      const page = await unwrap<{ items: Transaction[] }>(
        api().GET('/api/transactions', {
          params: {
            query: { account_id: accountId, sort_by: 'date', sort_dir: 'asc', limit: 1, include_opening_balance: true },
          },
        }),
      )
      return page.items[0]?.date ?? null
    },
    enabled,
    staleTime: 5 * 60_000,
  })
}

type Mode = 'balance' | 'cycle'

/**
 * Balance over time for one account, with a range picker. Credit cards also
 * get "This cycle": spending since the statement closed, as the web shows.
 */
export function BalanceHistoryCard({ account }: { account: Account }) {
  const { t } = useTranslation()
  const colors = useColors()
  const { locale, dateLocale } = useDisplayFormat()
  const isCard = account.type === 'credit_card'
  const [mode, setMode] = useState<Mode>(isCard ? 'cycle' : 'balance')
  const [rangeKey, setRangeKey] = useState<HistoryRange>('3M')
  const today = new Date()

  const first = useFirstTransactionDate(account.id, mode === 'balance' && rangeKey === 'all')
  const range = historyRange(rangeKey, today, first.data)
  const waitingForFirst = rangeKey === 'all' && first.isPending
  const series = useBalanceSeries(account.id, range, mode === 'balance' && !waitingForFirst)

  const cycle = cycleBounds(account.statement_close_day, today)
  const cycleElapsed = { from: cycle.from, to: cycle.to < toIsoDate(today) ? cycle.to : toIsoDate(today) }
  const cycleReport = useIncomeExpenses(rangeQuery(cycleElapsed, 'daily', [account.id]), { enabled: mode === 'cycle' })

  const dayLabel = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(dateLocale, { day: 'numeric', month: 'short' }).format(fromIsoDate(iso))
    } catch {
      return iso
    }
  }

  const body = () => {
    if (mode === 'cycle') {
      if (cycleReport.isError) return <ErrorState error={cycleReport.error} onRetry={() => cycleReport.refetch()} />
      if (cycleReport.isPending) return <Loading />
      const values = cumulativeDaily(cycleReport.data, cycleElapsed)
      const currency = cycleReport.data.meta.currency
      const spent = values.at(-1) ?? 0
      // Start from zero the day before the cycle, like the web chart.
      const points = [{ label: '', value: 0 }, ...values.map((value, i) => ({ label: dayLabel(addDaysIso(cycle.from, i)), value }))]
      return (
        <>
          <AmountText variant="heading" value={spent} currency={currency} />
          <Text variant="caption" tone="muted">
            {t('accounts.history.cycleRange', { range: formatRange(cycle, dateLocale) })}
          </Text>
          <LineChart
            points={points}
            color={colors.expense}
            accessibilityLabel={t('accounts.history.cycleA11y', {
              amount: formatCurrency(spent, currency, locale),
              range: formatRange(cycle, dateLocale),
            })}
          />
        </>
      )
    }
    if (series.isError) return <ErrorState error={series.error} onRetry={() => series.refetch()} />
    if (waitingForFirst || series.isPending) return <Loading />
    const aligned = alignSign(series.data, accountBalance(account))
    if (aligned.length < 2) return <Text tone="muted">{t('accounts.history.empty')}</Text>
    const start = aligned[0]!.balance
    const end = aligned.at(-1)!.balance
    const change = end - start
    const points = downsample(aligned, CHART_POINTS).map((p) => ({ label: dayLabel(p.date), value: p.balance }))
    return (
      <>
        <View style={styles.changeRow}>
          <Text variant="caption" tone={change === 0 ? 'muted' : (change > 0) !== isCard ? 'income' : 'expense'}>
            {`${change > 0 ? '▲' : change < 0 ? '▼' : ''} ${formatCurrency(Math.abs(change), account.currency, locale)}`.trim()}
          </Text>
          <Text variant="caption" tone="muted">
            {t('accounts.history.sinceStart', { range: formatRange(range, dateLocale) })}
          </Text>
        </View>
        <LineChart
          points={points}
          color={isCard ? colors.expense : undefined}
          accessibilityLabel={t(isCard ? 'accounts.history.owedA11y' : 'accounts.history.balanceA11y', {
            start: formatCurrency(start, account.currency, locale),
            end: formatCurrency(end, account.currency, locale),
            range: formatRange(range, dateLocale),
          })}
        />
        <SegmentedControl
          options={HISTORY_RANGES.map((key) => ({ value: key, label: t(`accounts.history.ranges.${key}`) }))}
          value={rangeKey}
          onChange={setRangeKey}
        />
      </>
    )
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text variant="label" tone="muted">
        {mode === 'cycle' ? t('accounts.history.cycleTitle') : isCard ? t('accounts.history.owedTitle') : t('accounts.history.balanceTitle')}
      </Text>
      {isCard ? (
        <SegmentedControl
          options={[
            { value: 'cycle', label: t('accounts.history.modes.cycle') },
            { value: 'balance', label: t('accounts.history.modes.balance') },
          ]}
          value={mode}
          onChange={setMode}
        />
      ) : null}
      {body()}
    </View>
  )
}

function addDaysIso(iso: string, days: number): string {
  const date = fromIsoDate(iso)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg, gap: spacing.sm, marginTop: spacing.md },
  changeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
})
