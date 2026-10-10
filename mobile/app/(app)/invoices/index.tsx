import { router } from 'expo-router'
import Repeat from 'lucide-react-native/icons/repeat'
import Settings2 from 'lucide-react-native/icons/settings-2'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Card } from '@/components/Card'
import { Fab } from '@/components/Fab'
import { ListRow } from '@/components/ListRow'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SelectSheet } from '@/components/SelectSheet'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { useInvoiceFacets, useInvoices, useInvoiceSettings, useInvoiceSummary } from '@/features/invoices/hooks'
import {
  AGING_BUCKETS,
  agingShares,
  applyFilter,
  displayNumber,
  FILTERS,
  type AgingBucket,
  type Invoice,
  type InvoiceDirection,
  type InvoiceFilter,
  type InvoiceSummary,
} from '@/features/invoices/model'
import { StateBadge } from '@/features/invoices/StateBadge'
import { useCanWrite, useDisplayFormat } from '@/features/session/hooks'
import { formatDate } from '@/lib/dates'
import { radius, spacing, useColors } from '@/theme'

/** Receivables (and bills): what is owed, what is late, what landed. */
export default function InvoicesScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const { dateLocale, currency } = useDisplayFormat()
  const canWrite = useCanWrite()
  const [direction, setDirection] = useState<InvoiceDirection>('receivable')
  const [filter, setFilter] = useState<InvoiceFilter>('all')
  // The current year by default, as on the web: it is almost always the question.
  const [year, setYear] = useState<number | null>(() => new Date().getFullYear())
  const [pickingYear, setPickingYear] = useState(false)
  const settings = useInvoiceSettings()
  const summary = useInvoiceSummary(direction)
  const facets = useInvoiceFacets(direction, year)
  const list = useInvoices({ direction, filter, year })
  const payable = direction === 'payable'

  const refresh = () => {
    void summary.refetch()
    void facets.refetch()
    void list.refetch()
  }

  const years = Array.from(new Set([new Date().getFullYear(), ...(facets.data?.years ?? [])])).sort((a, b) => b - a)
  const counts = facets.data?.counts
  const visible = list.data ? applyFilter(list.data, filter) : []

  const row = (invoice: Invoice) => {
    const number = displayNumber(invoice, settings.data?.number_prefix) ?? t('invoices.noNumber')
    const subtitle = [
      number,
      `${t('invoices.dueDate')} ${formatDate(invoice.next_due_date ?? invoice.due_date, dateLocale)}`,
      invoice.days_overdue ? t('invoices.daysLate', { count: invoice.days_overdue }) : null,
    ]
      .filter(Boolean)
      .join(' · ')
    const partly = invoice.state === 'partial'
    return (
      <ListRow
        key={invoice.id}
        title={invoice.payee?.name ?? (payable ? t('invoices.noSupplier') : t('invoices.noClient'))}
        subtitle={subtitle}
        onPress={() => router.push({ pathname: '/invoices/[id]', params: { id: invoice.id } })}
        trailing={
          <View style={styles.trailing}>
            <AmountText variant="label" value={Number(partly ? invoice.balance : invoice.total)} currency={invoice.currency} />
            <StateBadge state={invoice.state} />
          </View>
        }
      />
    )
  }

  return (
    <View style={styles.root}>
      <Screen onRefresh={refresh} refreshing={list.isRefetching}>
        <SegmentedControl
          options={[
            { value: 'receivable', label: t('invoices.direction.receivable') },
            { value: 'payable', label: t('invoices.direction.payable') },
          ]}
          value={direction}
          onChange={setDirection}
        />

        {summary.data ? (
          <Card>
            <Text variant="label" tone="muted">
              {payable ? t('invoices.summary.owed') : t('invoices.summary.outstanding')}
            </Text>
            <AmountText variant="title" value={Number(summary.data.outstanding)} currency={currency} />
            <View style={styles.flows}>
              <View style={styles.flow}>
                <Text variant="caption" tone="muted">
                  {t('invoices.summary.overdue')}
                </Text>
                <AmountText
                  variant="label"
                  tone={Number(summary.data.overdue_amount) > 0 ? 'expense' : 'default'}
                  value={Number(summary.data.overdue_amount)}
                  currency={currency}
                />
                {summary.data.overdue_count ? (
                  <Text variant="caption" tone="muted">
                    {t('invoices.summary.overdueCount', { count: summary.data.overdue_count })}
                  </Text>
                ) : null}
              </View>
              <View style={styles.flow}>
                <Text variant="caption" tone="muted">
                  {payable ? t('invoices.summary.paidThisMonth') : t('invoices.summary.receivedThisMonth')}
                </Text>
                <AmountText variant="label" tone="income" value={Number(summary.data.received_this_month)} currency={currency} />
              </View>
            </View>
          </Card>
        ) : null}

        {summary.data && Number(summary.data.outstanding) > 0 ? <AgingCard buckets={summary.data.buckets} currency={currency} /> : null}

        {summary.data?.upcoming?.length ? (
          <>
            <SectionHeader title={t('invoices.summary.upcoming')} />
            <Card style={styles.list}>{summary.data.upcoming.slice(0, 5).map(row)}</Card>
          </>
        ) : null}

        <Card style={styles.list}>
          {payable ? null : (
            <ListRow
              title={t('invoices.schedules.entry')}
              leading={<Repeat size={20} color={colors.primary} />}
              onPress={() => router.push('/invoices/schedules')}
              showChevron
            />
          )}
          {canWrite ? (
            <ListRow
              title={t('invoices.settings.title')}
              leading={<Settings2 size={20} color={colors.primary} />}
              onPress={() => router.push('/invoices/settings')}
              showChevron
            />
          ) : null}
        </Card>

        <PickerField
          label={t('invoices.year')}
          value={year ? t('invoices.fiscalYear', { year }) : t('invoices.allYears')}
          placeholder={t('invoices.allYears')}
          onPress={() => setPickingYear(true)}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map((value) => {
            const selected = value === filter
            const count = counts?.[value]
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setFilter(value)}
                style={[
                  styles.chip,
                  { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.accent : colors.card },
                ]}
              >
                <Text variant="label" tone={selected ? 'primary' : 'default'}>
                  {count != null ? `${t(`invoices.filter.${value}`)} · ${count}` : t(`invoices.filter.${value}`)}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {list.isPending ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : visible.length === 0 ? (
          filter !== 'all' ? (
            <EmptyState title={t('invoices.emptyFiltered')} />
          ) : (
            <EmptyState
              title={payable ? t('invoices.emptyPayableTitle') : t('invoices.emptyTitle')}
              body={payable ? t('invoices.emptyPayable') : t('invoices.empty')}
            />
          )
        ) : (
          <Card style={styles.list}>{visible.map(row)}</Card>
        )}
        <View style={styles.fabSpace} />
      </Screen>
      {canWrite ? (
        <Fab
          label={payable ? t('invoices.newPayable') : t('invoices.new')}
          onPress={() => router.push({ pathname: '/invoices/form', params: { direction } })}
        />
      ) : null}
      <SelectSheet
        visible={pickingYear}
        title={t('invoices.year')}
        options={years.map((y) => ({ value: String(y), label: t('invoices.fiscalYear', { year: y }) }))}
        noneLabel={t('invoices.allYears')}
        selected={year ? String(year) : null}
        onSelect={(value) => {
          setYear(value ? Number(value) : null)
          setPickingYear(false)
        }}
        onClose={() => setPickingYear(false)}
      />
    </View>
  )
}

const BUCKET_COLORS: Record<AgingBucket, string> = {
  current: '#10B981',
  d1_30: '#FBBF24',
  d31_60: '#F97316',
  d61_90: '#F43F5E',
  d90_plus: '#BE123C',
}

/** What is owed by age, as one stacked bar and a legend; the tone warms with the age. */
function AgingCard({ buckets, currency }: { buckets: InvoiceSummary['buckets']; currency: string }) {
  const { t } = useTranslation()
  const colors = useColors()
  const shares = agingShares(buckets)
  return (
    <Card>
      <Text variant="label" tone="muted">
        {t('invoices.summary.aging')}
      </Text>
      <View style={[styles.bar, { backgroundColor: colors.muted }]}>
        {AGING_BUCKETS.map((key) =>
          shares[key] > 0 ? <View key={key} style={{ flex: shares[key], backgroundColor: BUCKET_COLORS[key] }} /> : null,
        )}
      </View>
      {AGING_BUCKETS.filter((key) => Number(buckets[key]) > 0).map((key) => (
        <View key={key} style={styles.legend}>
          <View style={[styles.swatch, { backgroundColor: BUCKET_COLORS[key] }]} />
          <Text variant="caption" style={styles.legendLabel}>
            {t(`invoices.bucket.${key}`)}
          </Text>
          <AmountText variant="caption" value={Number(buckets[key])} currency={currency} />
        </View>
      ))}
    </Card>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 10, borderRadius: radius.full, overflow: 'hidden', marginVertical: spacing.sm },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { flex: 1 },
  root: { flex: 1 },
  list: { padding: 0, overflow: 'hidden' },
  flows: { flexDirection: 'row', marginTop: spacing.sm },
  flow: { flex: 1, gap: 2 },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },
  trailing: { alignItems: 'flex-end', gap: spacing.xs },
  fabSpace: { height: 72 },
})
