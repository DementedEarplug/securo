import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Card } from '@/components/Card'
import { Fab } from '@/components/Fab'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { useScheduleSummary, useSchedules } from '@/features/invoices/hooks'
import { ScheduleBadge } from '@/features/invoices/ScheduleBadge'
import { SCHEDULE_FILTERS, type Schedule, type ScheduleFilter } from '@/features/invoices/schedules'
import { useCanWrite, useDisplayFormat } from '@/features/session/hooks'
import { formatDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { radius, spacing, useColors } from '@/theme'

/** Agreements that bill a client every period, and what they bring in a month. */
export default function SchedulesScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const { locale, dateLocale } = useDisplayFormat()
  const canWrite = useCanWrite()
  const [filter, setFilter] = useState<ScheduleFilter>('all')
  const summary = useScheduleSummary()
  const list = useSchedules(filter)

  const counts = summary.data
    ? {
        all: summary.data.active_count + summary.data.paused_count + summary.data.ended_count,
        active: summary.data.active_count,
        paused: summary.data.paused_count,
        ended: summary.data.ended_count,
      }
    : undefined

  const row = (schedule: Schedule) => {
    const term = schedule.current_term ?? schedule.next_term
    const subtitle = [
      schedule.payee?.name ?? t('invoices.noClient'),
      term
        ? `${t(`invoices.schedules.frequency.${schedule.frequency}`)} · ${formatCurrency(Number(term.total), schedule.currency, locale)}`
        : t(`invoices.schedules.frequency.${schedule.frequency}`),
      schedule.status === 'active' && schedule.next_period_start
        ? `${t('invoices.schedules.column.next')} ${formatDate(schedule.next_period_start, dateLocale)}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ')
    return (
      <ListRow
        key={schedule.id}
        title={schedule.name}
        subtitle={subtitle}
        subtitleLines={2}
        onPress={() => router.push({ pathname: '/invoices/schedules/[id]', params: { id: schedule.id } })}
        trailing={
          <View style={styles.trailing}>
            {schedule.status === 'active' ? (
              <AmountText variant="label" value={Number(schedule.monthly_amount)} currency={schedule.currency} />
            ) : (
              <Text variant="label" tone="muted">
                —
              </Text>
            )}
            <ScheduleBadge schedule={schedule} />
          </View>
        }
      />
    )
  }

  return (
    <View style={styles.root}>
      <Screen
        onRefresh={() => {
          void summary.refetch()
          void list.refetch()
        }}
        refreshing={list.isRefetching}
      >
        {summary.data ? (
          summary.data.by_currency.length === 0 ? (
            <Card>
              <Text variant="label" tone="muted">
                {t('invoices.schedules.summary.monthly')}
              </Text>
              <Text tone="muted">{t('invoices.schedules.summary.none')}</Text>
            </Card>
          ) : (
            summary.data.by_currency.map((bucket) => (
              <Card key={bucket.currency}>
                <Text variant="label" tone="muted">
                  {t('invoices.schedules.summary.monthly')}
                </Text>
                <AmountText variant="title" value={Number(bucket.monthly_recurring)} currency={bucket.currency} />
                <Text variant="caption" tone="muted">
                  {t('invoices.schedules.summary.activeCount', { count: bucket.active_count })}
                </Text>
                <View style={styles.stats}>
                  <View style={styles.stat}>
                    <Text variant="caption" tone="muted">
                      {t('invoices.schedules.summary.yearly')}
                    </Text>
                    <AmountText variant="label" value={Number(bucket.monthly_recurring) * 12} currency={bucket.currency} />
                  </View>
                  <View style={styles.stat}>
                    <Text variant="caption" tone="muted">
                      {t('invoices.schedules.summary.lost')}
                    </Text>
                    <AmountText
                      variant="label"
                      tone={Number(bucket.monthly_lost) > 0 ? 'expense' : 'default'}
                      value={Number(bucket.monthly_lost)}
                      currency={bucket.currency}
                    />
                    {bucket.ended_recently_count ? (
                      <Text variant="caption" tone="muted">
                        {t('invoices.schedules.summary.endedRecently', { count: bucket.ended_recently_count })}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.stat}>
                    <Text variant="caption" tone="muted">
                      {t('invoices.schedules.summary.pastDue')}
                    </Text>
                    <Text variant="label" tone={bucket.past_due_count ? 'expense' : 'default'}>
                      {bucket.past_due_count}
                    </Text>
                  </View>
                </View>
              </Card>
            ))
          )
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {SCHEDULE_FILTERS.map((value) => {
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
                  {count != null
                    ? `${t(`invoices.schedules.filter.${value}`)} · ${count}`
                    : t(`invoices.schedules.filter.${value}`)}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {list.isPending ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.length === 0 ? (
          <EmptyState
            title={filter === 'all' ? t('invoices.schedules.entry') : t('invoices.schedules.emptyFiltered')}
            body={filter === 'all' ? t('invoices.schedules.empty') : undefined}
          />
        ) : (
          <Card style={styles.list}>{list.data.map(row)}</Card>
        )}
        <View style={styles.fabSpace} />
      </Screen>
      {canWrite ? <Fab label={t('invoices.schedules.new')} onPress={() => router.push('/invoices/schedules/form')} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 0, overflow: 'hidden' },
  stats: { flexDirection: 'row', marginTop: spacing.sm, gap: spacing.sm },
  stat: { flex: 1, gap: 2 },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },
  trailing: { alignItems: 'flex-end', gap: spacing.xs },
  fabSpace: { height: 72 },
})
