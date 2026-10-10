import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AmountText } from '@/components/AmountText'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { CategoryIcon } from '@/components/CategoryIcon'
import { Icon } from '@/components/Icon'
import { ListRow } from '@/components/ListRow'
import { SectionHeader } from '@/components/SectionHeader'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Text } from '@/components/Text'
import { useRecurring } from '@/features/recurring/hooks'
import { useDisplayFormat } from '@/features/session/hooks'
import { formatDate, formatMonth, toIsoDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { radius, spacing, useColors } from '@/theme'
import {
  dailySpending,
  groupByDate,
  heatLevel,
  HEAT_LEVELS,
  monthGrid,
  monthOccurrences,
  monthOf,
  monthRange,
  recurringTotals,
  shiftCalendarMonth,
  spendingRange,
  subscriptions,
  type CalendarMode,
  type HeatLevel,
  type RecurringOccurrence,
} from '../calendar'
import { useBookedRecurring, useProjectedTransactions } from '../calendarHooks'
import { drillDown } from '../drilldown'
import { rangeQuery, type ReportFilters } from '../filters'
import { useIncomeExpenses } from '../hooks'
import { QueryGate } from './shared'

// Opacity of the spending colour per heat level (level 0 has no fill).
const HEAT_ALPHA: Record<HeatLevel, string> = { 0: '00', 1: '26', 2: '4D', 3: '85', 4: 'CC' }
const SWIPE_DISTANCE = 50

/** Compact amount for a calendar cell: "15", "120", "1.2k", "12k". */
export function cellAmount(value: number): string {
  const v = Math.round(Math.abs(value))
  if (v < 1000) return String(v)
  return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`
}

function openRecurring(id: string | null) {
  if (id) router.push({ pathname: '/recurring/form', params: { id } })
}

/**
 * A month calendar: past days shaded by spending, and the recurring bills,
 * subscriptions and income that land on each day. Below it, the month's
 * recurring total and every active bill or subscription at its monthly cost.
 */
export function SpendingCalendar({ filters }: { filters: ReportFilters }) {
  const { t, i18n } = useTranslation()
  const colors = useColors()
  const { locale, dateLocale, currency } = useDisplayFormat()
  const today = toIsoDate(new Date())
  const [month, setMonth] = useState(() => monthOf(new Date()))
  const [mode, setMode] = useState<CalendarMode>('both')
  const [selected, setSelected] = useState<string | null>(null)
  const range = monthRange(month)
  const accountIds = filters.accountIds

  const spendRange = spendingRange(range, today)
  const report = useIncomeExpenses(rangeQuery(spendRange ?? range, 'daily', accountIds), { enabled: spendRange !== null })
  const projected = useProjectedTransactions(range, accountIds)
  const booked = useBookedRecurring(range, accountIds)
  const recurring = useRecurring()

  const shift = (delta: number) => setMonth((m) => shiftCalendarMonth(m, delta))
  // Swipe left/right across the grid to change month. The state setter is
  // stable, so the responder is created once.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderRelease: (_, g) => {
          if (g.dx <= -SWIPE_DISTANCE) setMonth((m) => shiftCalendarMonth(m, 1))
          else if (g.dx >= SWIPE_DISTANCE) setMonth((m) => shiftCalendarMonth(m, -1))
        },
      }),
    [setMonth],
  )

  const showSpending = mode !== 'recurring'
  const showRecurring = mode !== 'spending'

  return (
    <View style={styles.root}>
      <SegmentedControl
        options={[
          { value: 'both', label: t('reports.calendar.modes.both') },
          { value: 'spending', label: t('reports.calendar.modes.spending') },
          { value: 'recurring', label: t('reports.calendar.modes.recurring') },
        ]}
        value={mode}
        onChange={setMode}
      />
      <View style={styles.monthNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('reports.calendar.previousMonth')}
          onPress={() => shift(-1)}
          hitSlop={12}
        >
          <Icon name="chevron-left" color={colors.foreground} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('reports.calendar.backToTodayHint')}
          onPress={() => setMonth(monthOf(new Date()))}
          style={styles.flex}
        >
          <Text variant="heading" style={styles.center}>
            {formatMonth(month, i18n.language)}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('reports.calendar.nextMonth')}
          onPress={() => shift(1)}
          hitSlop={12}
        >
          <Icon name="chevron-right" color={colors.foreground} />
        </Pressable>
      </View>

      <QueryGate queries={spendRange ? [report, projected, booked, recurring] : [projected, booked, recurring]}>
        {() => {
          const spending = dailySpending(report.data)
          const max = Math.max(0, ...spending.values())
          const monthTotal = [...spending.values()].reduce((sum, v) => sum + v, 0)
          const busiest = [...spending.entries()].sort((a, b) => b[1] - a[1])[0]
          const occurrences = monthOccurrences(projected.data ?? [], booked.data ?? [], today)
          const byDate = groupByDate(occurrences)
          const totals = recurringTotals(occurrences)
          const subs = subscriptions(recurring.data ?? [], accountIds)
          const money = (v: number) => formatCurrency(v, currency, locale)
          return (
            <>
              <Card style={styles.gridCard}>
                <View {...pan.panHandlers}>
                  <Weekdays locale={i18n.language} />
                  {monthGrid(month).map((week, i) => (
                    <View key={i} style={styles.week}>
                      {week.map((date, j) =>
                        date ? (
                          <DayCell
                            key={date}
                            date={date}
                            today={date === today}
                            future={date > today}
                            spent={showSpending ? (spending.get(date) ?? 0) : 0}
                            level={showSpending ? heatLevel(spending.get(date) ?? 0, max) : 0}
                            items={showRecurring ? (byDate.get(date) ?? []) : []}
                            onPress={() => setSelected(date)}
                            accessibilityLabel={dayA11y(t, date, dateLocale, spending.get(date) ?? 0, byDate.get(date) ?? [], money, showSpending, showRecurring)}
                          />
                        ) : (
                          <View key={`pad-${i}-${j}`} style={styles.cell} />
                        ),
                      )}
                    </View>
                  ))}
                </View>
                <CalendarLegend showSpending={showSpending} showRecurring={showRecurring} />
              </Card>

              {showSpending ? (
                <Card style={styles.stats}>
                  <Stat label={t('reports.calendar.spentThisMonth')} value={money(monthTotal)} />
                  <Stat
                    label={t('reports.calendar.busiestDay')}
                    value={busiest ? money(busiest[1]) : '—'}
                    detail={busiest ? formatDate(busiest[0], dateLocale) : undefined}
                  />
                </Card>
              ) : null}

              {showRecurring ? (
                <>
                  <SectionHeader title={t('reports.calendar.monthRecurring')} />
                  <Card style={styles.stats}>
                    <Stat label={t('reports.calendar.committed')} value={money(totals.committed)} />
                    <Stat label={t('reports.calendar.paid')} value={money(totals.paid)} />
                    <Stat label={t('reports.calendar.upcoming')} value={money(totals.upcoming + totals.due)} />
                  </Card>
                  {totals.due > 0 ? (
                    <Text variant="caption" tone="muted">
                      {t('reports.calendar.dueNote', { amount: money(totals.due) })}
                    </Text>
                  ) : null}
                  {totals.income > 0 ? (
                    <Text variant="caption" tone="muted">
                      {t('reports.calendar.expectedIncome', { amount: money(totals.income) })}
                    </Text>
                  ) : null}
                  <Card style={styles.list}>
                    {occurrences.length === 0 ? (
                      <ListRow title={t('reports.calendar.noRecurring')} subtitle={t('reports.calendar.noRecurringHint')} />
                    ) : (
                      occurrences.map((o) => <OccurrenceRow key={o.key} item={o} currency={currency} />)
                    )}
                  </Card>

                  <SectionHeader title={t('reports.calendar.subscriptions')} />
                  <Card style={styles.stats}>
                    <Stat label={t('reports.calendar.perMonth')} value={money(subs.monthly)} />
                    <Stat label={t('reports.calendar.perYear')} value={money(Math.round(subs.monthly * 12 * 100) / 100)} />
                  </Card>
                  <Card style={styles.list}>
                    {subs.items.length === 0 ? (
                      <ListRow title={t('reports.calendar.noSubscriptions')} />
                    ) : (
                      subs.items.map((s) => (
                        <ListRow
                          key={s.id}
                          title={s.description}
                          subtitle={[
                            t(`common.frequencies.${s.frequency}`, { defaultValue: s.frequency }),
                            s.nextOccurrence ? t('reports.calendar.next', { date: formatDate(s.nextOccurrence, dateLocale) }) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          onPress={() => openRecurring(s.id)}
                          trailing={
                            <View style={styles.trailing}>
                              <Text variant="label">{t('reports.calendar.monthlyAmount', { amount: money(s.monthly) })}</Text>
                              {s.frequency !== 'monthly' ? (
                                <Text variant="caption" tone="muted">
                                  {formatCurrency(s.amount, s.currency, locale)}
                                </Text>
                              ) : null}
                            </View>
                          }
                        />
                      ))
                    )}
                  </Card>
                </>
              ) : null}

              <DaySheet
                date={selected}
                spent={selected ? (spending.get(selected) ?? 0) : 0}
                items={selected ? (byDate.get(selected) ?? []) : []}
                currency={currency}
                onClose={() => setSelected(null)}
                onTransactions={(date) => {
                  setSelected(null)
                  drillDown({
                    title: formatDate(date, dateLocale),
                    from: date,
                    to: date,
                    accountIds,
                    type: 'debit',
                  })
                }}
              />
            </>
          )
        }}
      </QueryGate>
    </View>
  )
}

function dayA11y(
  t: (key: string, options?: Record<string, unknown>) => string,
  date: string,
  locale: string,
  spent: number,
  items: RecurringOccurrence[],
  money: (v: number) => string,
  showSpending: boolean,
  showRecurring: boolean,
): string {
  const parts = [formatDate(date, locale)]
  if (showSpending && spent > 0) parts.push(t('reports.calendar.spentA11y', { amount: money(spent) }))
  if (showRecurring && items.length) parts.push(t('reports.calendar.recurringA11y', { count: items.length }))
  return parts.join(', ')
}

function Weekdays({ locale }: { locale: string }) {
  // A known Sunday, then the following six days.
  const names = Array.from({ length: 7 }, (_, i) => {
    try {
      return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2024, 0, 7 + i))
    } catch {
      return 'SMTWTFS'[i]!
    }
  })
  return (
    <View style={styles.week} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {names.map((name, i) => (
        <Text key={i} variant="caption" tone="muted" style={[styles.flex, styles.center]}>
          {name}
        </Text>
      ))}
    </View>
  )
}

function DayCell({
  date,
  today,
  future,
  spent,
  level,
  items,
  onPress,
  accessibilityLabel,
}: {
  date: string
  today: boolean
  future: boolean
  spent: number
  level: HeatLevel
  items: RecurringOccurrence[]
  onPress: () => void
  accessibilityLabel: string
}) {
  const colors = useColors()
  const bills = items.filter((i) => i.type === 'debit')
  const billTotal = bills.reduce((sum, i) => sum + i.amount, 0)
  const hasIncome = items.some((i) => i.type === 'credit')
  const statusColor = bills.some((i) => i.status === 'due')
    ? colors.warning
    : bills.length && bills.every((i) => i.status === 'paid')
      ? colors.income
      : colors.primary
  const dark = level >= 3
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[
        styles.cell,
        styles.day,
        { backgroundColor: level ? `${colors.expense}${HEAT_ALPHA[level]}` : 'transparent' },
        today ? { borderColor: colors.primary, borderWidth: 2 } : null,
      ]}
    >
      <Text
        variant="caption"
        style={{ color: dark ? '#FFFFFF' : future ? colors.mutedForeground : colors.foreground, fontWeight: today ? '700' : '400' }}
      >
        {Number(date.slice(8))}
      </Text>
      {spent > 0 && !bills.length ? (
        <Text style={[styles.cellAmount, { color: dark ? '#FFFFFF' : colors.mutedForeground }]}>{cellAmount(spent)}</Text>
      ) : null}
      {bills.length ? (
        <View style={[styles.billChip, { backgroundColor: statusColor }]}>
          <Text style={styles.billText}>{cellAmount(billTotal)}</Text>
        </View>
      ) : null}
      {hasIncome ? <View style={[styles.incomeDot, { backgroundColor: colors.income }]} /> : null}
    </Pressable>
  )
}

function CalendarLegend({ showSpending, showRecurring }: { showSpending: boolean; showRecurring: boolean }) {
  const { t } = useTranslation()
  const colors = useColors()
  return (
    <View style={styles.legend}>
      {showSpending ? (
        <View style={styles.legendRow}>
          <Text variant="caption" tone="muted">
            {t('reports.calendar.less')}
          </Text>
          {HEAT_LEVELS.map((level) => (
            <View
              key={level}
              style={[
                styles.swatch,
                { backgroundColor: level ? `${colors.expense}${HEAT_ALPHA[level]}` : colors.muted },
              ]}
            />
          ))}
          <Text variant="caption" tone="muted">
            {t('reports.calendar.more')}
          </Text>
        </View>
      ) : null}
      {showRecurring ? (
        <View style={styles.legendRow}>
          <LegendDot color={colors.primary} label={t('reports.calendar.upcoming')} />
          <LegendDot color={colors.warning} label={t('reports.calendar.due')} />
          <LegendDot color={colors.income} label={t('reports.calendar.paid')} />
          <LegendDot color={colors.income} label={t('reports.calendar.income')} round />
        </View>
      ) : null}
    </View>
  )
}

function LegendDot({ color, label, round }: { color: string; label: string; round?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[round ? styles.legendRound : styles.legendChip, { backgroundColor: color }]} />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="label">{value}</Text>
      {detail ? (
        <Text variant="caption" tone="muted">
          {detail}
        </Text>
      ) : null}
    </View>
  )
}

function OccurrenceRow({ item, currency }: { item: RecurringOccurrence; currency: string }) {
  const { t } = useTranslation()
  const { dateLocale } = useDisplayFormat()
  return (
    <ListRow
      title={item.description}
      subtitle={`${formatDate(item.date, dateLocale)} · ${t(`reports.calendar.${item.type === 'credit' ? 'income' : item.status}`)}`}
      leading={<CategoryIcon icon={item.categoryIcon} color={item.categoryColor} size="sm" />}
      onPress={item.recurringId ? () => openRecurring(item.recurringId) : undefined}
      trailing={
        <AmountText
          variant="label"
          value={item.type === 'credit' ? item.amount : -item.amount}
          currency={currency}
          tone={item.type === 'credit' ? 'income' : 'default'}
        />
      }
    />
  )
}

function DaySheet({
  date,
  spent,
  items,
  currency,
  onClose,
  onTransactions,
}: {
  date: string | null
  spent: number
  items: RecurringOccurrence[]
  currency: string
  onClose: () => void
  onTransactions: (date: string) => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const { dateLocale } = useDisplayFormat()
  return (
    <Modal visible={date !== null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
      <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={styles.sheetHeader}>
          <Text variant="heading" style={styles.flex}>
            {date ? formatDate(date, dateLocale) : ''}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={12}>
            <Icon name="close" color={colors.foreground} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody}>
          <View style={styles.sheetSpent}>
            <Text tone="muted">{t('reports.calendar.spentThatDay')}</Text>
            <AmountText variant="label" value={spent} currency={currency} />
          </View>
          {spent > 0 && date ? (
            <Button label={t('reports.calendar.seeTransactions')} variant="secondary" onPress={() => onTransactions(date)} />
          ) : null}
          {items.length ? (
            <>
              <SectionHeader title={t('reports.calendar.recurringThatDay')} />
              <Card style={styles.list}>
                {items.map((o) => (
                  <OccurrenceRow key={o.key} item={o} currency={currency} />
                ))}
              </Card>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  gridCard: { gap: spacing.sm, paddingHorizontal: spacing.sm },
  week: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  cell: { flex: 1, minHeight: 52 },
  day: {
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    paddingTop: 4,
    gap: 2,
  },
  cellAmount: { fontSize: 10 },
  billChip: { borderRadius: radius.full, paddingHorizontal: 4, minWidth: 18, alignItems: 'center' },
  billText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
  incomeDot: { position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3 },
  legend: { gap: spacing.sm, paddingHorizontal: spacing.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendChip: { width: 14, height: 8, borderRadius: radius.full },
  legendRound: { width: 8, height: 8, borderRadius: 4 },
  swatch: { width: 14, height: 14, borderRadius: 3 },
  stats: { flexDirection: 'row', gap: spacing.md },
  stat: { flex: 1, gap: 2 },
  list: { padding: 0, overflow: 'hidden' },
  trailing: { alignItems: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    maxHeight: '70%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  sheetSpent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
})
