import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Text } from '@/components/Text'
import { useCanWrite, useDisplayFormat } from '@/features/session/hooks'
import { formatCurrency } from '@/lib/format'
import { spacing, useColors } from '@/theme'
import { formatRange } from '../buckets'
import { reportTotals, type FlowGroup } from '../compare'
import { drillDown } from '../drilldown'
import { rangeQuery, resolveRange, type ReportFilters } from '../filters'
import { useIncomeExpenses } from '../hooks'
import { formatShare, nextPayeeLimit, payeeQuery, payeeRows, usePayeeReport, type PayeeLimit, type PayeeRow } from '../payees'
import { DeltaText, GroupToggle, NoData, QueryGate } from './shared'

/** Who the money went to (or came from) in the range, biggest first, against the period before. */
export function TopPayees({ filters }: { filters: ReportFilters }) {
  const { t } = useTranslation()
  const { dateLocale } = useDisplayFormat()
  const [group, setGroup] = useState<FlowGroup>('expenses')
  const [limit, setLimit] = useState<PayeeLimit>(10)
  const type = group === 'expenses' ? 'debit' : 'credit'
  const range = resolveRange(filters)
  const report = usePayeeReport(payeeQuery(range, type, limit, filters.accountIds))
  // The range's whole spending/income, so each payee's share counts everyone past the list too.
  const totals = useIncomeExpenses(rangeQuery(range, 'monthly', filters.accountIds))
  const periodTotal = totals.data ? reportTotals(totals.data)[group] : null

  const changeGroup = (next: FlowGroup) => {
    setGroup(next)
    setLimit(10)
  }

  return (
    <View style={styles.root}>
      <GroupToggle value={group} onChange={changeGroup} />
      <QueryGate queries={[report]}>
        {() => {
          const data = report.data!
          const currency = data.meta.currency
          const rows = payeeRows(data, periodTotal)
          if (rows.length === 0 && data.unassigned.total === 0) return <NoData />
          const more = data.items.length >= limit ? nextPayeeLimit(limit) : null
          return (
            <>
              <Text variant="caption" tone="muted">
                {t('reports.payees.versus', {
                  previous: formatRange({ from: data.meta.previous_start_date, to: data.meta.previous_end_date }, dateLocale),
                })}
              </Text>
              {rows.length ? (
                <Card style={styles.list}>
                  {rows.map((row) => (
                    <PayeeBar
                      key={row.id}
                      row={row}
                      currency={currency}
                      goodWhenUp={group === 'income'}
                      onPress={() =>
                        drillDown({ title: row.name, ...range, accountIds: filters.accountIds, payeeId: row.id, type })
                      }
                    />
                  ))}
                </Card>
              ) : null}
              {more ? (
                <Button
                  variant="secondary"
                  label={t('reports.payees.showMore', { count: more })}
                  loading={report.isPlaceholderData}
                  onPress={() => setLimit(more)}
                />
              ) : null}
              {data.unassigned.total > 0 ? (
                <Unassigned total={data.unassigned.total} count={data.unassigned.count} share={periodTotal ? data.unassigned.total / periodTotal : null} currency={currency} />
              ) : null}
            </>
          )
        }}
      </QueryGate>
      <Text variant="caption" tone="muted">
        {t('reports.payees.hint', { range: formatRange(range, dateLocale) })}
      </Text>
    </View>
  )
}

function PayeeBar({
  row,
  currency,
  goodWhenUp,
  onPress,
}: {
  row: PayeeRow
  currency: string
  goodWhenUp: boolean
  onPress: () => void
}) {
  const { t } = useTranslation()
  const { locale } = useDisplayFormat()
  const colors = useColors()
  const canWrite = useCanWrite()
  const share = formatShare(row.share)
  const editPayee = canWrite ? () => router.push({ pathname: '/payees/form', params: { id: row.id } }) : undefined
  const details = [t('reports.payees.count', { count: row.count }), share].filter(Boolean).join(' · ')

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[row.name, formatCurrency(row.total, currency, locale), details].join(', ')}
      accessibilityHint={t('reports.payees.openHint')}
      accessibilityActions={editPayee ? [{ name: 'longpress', label: t('reports.payees.editPayee') }] : undefined}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'longpress') editPayee?.()
      }}
      onPress={onPress}
      onLongPress={editPayee}
      android_ripple={{ color: colors.muted }}
      style={[styles.row, { borderBottomColor: colors.border }]}
    >
      <View style={styles.line}>
        <Text numberOfLines={1} style={styles.flex}>
          {row.name}
        </Text>
        <AmountText variant="label" value={row.total} currency={currency} />
      </View>
      <View style={[styles.track, { backgroundColor: colors.muted }]}>
        <View style={[styles.fill, { width: `${Math.max(row.bar * 100, 1)}%`, backgroundColor: colors.primary }]} />
      </View>
      <View style={styles.line}>
        <Text variant="caption" tone="muted" numberOfLines={1} style={styles.flex}>
          {details}
        </Text>
        {row.isNew ? (
          <Text variant="caption" tone="primary">
            {t('reports.payees.new')}
          </Text>
        ) : (
          <DeltaText value={row.change} currency={currency} goodWhenUp={goodWhenUp} />
        )}
      </View>
    </Pressable>
  )
}

/** Rows without a payee: shown for completeness, not part of the ranking. */
function Unassigned({ total, count, share, currency }: { total: number; count: number; share: number | null; currency: string }) {
  const { t } = useTranslation()
  const details = [t('reports.payees.count', { count }), formatShare(share)].filter(Boolean).join(' · ')
  return (
    <Card style={styles.unassigned}>
      <View style={styles.line}>
        <Text style={styles.flex}>{t('reports.payees.unassigned')}</Text>
        <AmountText variant="label" value={total} currency={currency} tone="muted" />
      </View>
      <Text variant="caption" tone="muted">
        {details}
      </Text>
      <Text variant="caption" tone="muted">
        {t('reports.payees.unassignedHint')}
      </Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  list: { padding: 0, overflow: 'hidden' },
  row: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  unassigned: { gap: spacing.xs },
})
