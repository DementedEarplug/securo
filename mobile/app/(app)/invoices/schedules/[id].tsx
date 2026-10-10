import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import {
  useDeleteSchedule,
  useGenerateNow,
  useInvoiceSettings,
  useSchedule,
  useScheduleAction,
  useScheduleInvoices,
} from '@/features/invoices/hooks'
import { displayNumber, invoiceErrorMessage } from '@/features/invoices/model'
import { ScheduleBadge } from '@/features/invoices/ScheduleBadge'
import { isUpcomingTerm, monthlyEquivalent, periodLabel, scheduleActions, sortTerms, type Schedule } from '@/features/invoices/schedules'
import { StateBadge } from '@/features/invoices/StateBadge'
import { useCanWrite, useDisplayFormat } from '@/features/session/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { formatDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { spacing } from '@/theme'

export default function ScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const schedule = useSchedule(id)
  if (schedule.isPending) return <Loading />
  if (schedule.isError) return <ErrorState error={schedule.error} onRetry={() => schedule.refetch()} />
  return <ScheduleDetail schedule={schedule.data} refreshing={schedule.isRefetching} onRefresh={() => schedule.refetch()} />
}

function ScheduleDetail({ schedule, refreshing, onRefresh }: { schedule: Schedule; refreshing: boolean; onRefresh: () => void }) {
  const { t } = useTranslation()
  const { locale, dateLocale } = useDisplayFormat()
  const canWrite = useCanWrite()
  const settings = useInvoiceSettings().data
  const invoices = useScheduleInvoices(schedule.id)
  const action = useScheduleAction(schedule.id)
  const generate = useGenerateNow(schedule.id)
  const remove = useDeleteSchedule()
  const actions = scheduleActions(schedule)
  const money = (value: string | number | null | undefined) => formatCurrency(Number(value ?? 0), schedule.currency, locale)
  const date = (value: string) => formatDate(value, dateLocale)
  const terms = sortTerms(schedule.terms ?? [])

  const fail = (e: unknown) => showError(invoiceErrorMessage(e, t))

  const runGenerate = async () => {
    if (!(await confirmDestructive(t('invoices.schedules.confirm.generateTitle'), t('invoices.schedules.confirm.generateBody'), t('invoices.schedules.action.generate')))) return
    try {
      const emitted = await generate.mutateAsync()
      if (emitted.length === 1) router.push({ pathname: '/invoices/[id]', params: { id: emitted[0]!.id } })
    } catch (e) {
      fail(e)
    }
  }

  const toggle = async () => {
    try {
      await action.mutateAsync(actions.canPause ? 'pause' : 'resume')
    } catch (e) {
      fail(e)
    }
  }

  const confirmDelete = async () => {
    if (!(await confirmDestructive(t('invoices.schedules.confirm.deleteTitle'), t('invoices.schedules.confirm.deleteBody')))) return
    try {
      await remove.mutateAsync(schedule.id)
      router.back()
    } catch (e) {
      fail(e)
    }
  }

  const span = [
    t('invoices.schedules.since', { date: date(schedule.start_date) }),
    schedule.end_type === 'on_date' && schedule.end_date ? t('invoices.schedules.untilDate', { date: date(schedule.end_date) }) : null,
    schedule.end_type === 'after_count' && schedule.end_count ? t('invoices.schedules.untilCount', { count: schedule.end_count }) : null,
    schedule.ended_at
      ? t('invoices.schedules.endedOn', {
          date: date(schedule.ended_at),
          reason: t(`invoices.schedules.endReason.${schedule.end_reason ?? 'other'}`),
        })
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const fact = (label: string, value: string, tone?: 'expense') => (
    <View style={styles.fact}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="label" tone={tone ?? 'default'}>
        {value}
      </Text>
    </View>
  )

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Stack.Screen options={{ title: schedule.name }} />
      <Card>
        <View style={styles.headline}>
          <Text variant="heading" style={styles.flex} numberOfLines={2}>
            {schedule.payee?.name ?? t('invoices.noClient')}
          </Text>
          <ScheduleBadge schedule={schedule} />
        </View>
        <Text variant="caption" tone="muted">
          {`${t(`invoices.schedules.frequency.${schedule.frequency}`)} · ${span}`}
        </Text>
        {schedule.status === 'paused' && schedule.pause_reason === 'failures' ? (
          <Text variant="caption" tone="expense">
            {t('invoices.schedules.pausedByFailures')}
          </Text>
        ) : null}
        <View style={styles.facts}>
          {fact(t('invoices.schedules.column.monthly'), money(schedule.monthly_amount))}
          {fact(t('invoices.schedules.figure.invoiced'), money(schedule.amount_invoiced))}
          {fact(t('invoices.schedules.figure.paid'), money(schedule.amount_paid))}
          {fact(
            t('invoices.schedules.column.next'),
            schedule.status === 'active' && schedule.next_period_start ? date(schedule.next_period_start) : '—',
          )}
          {schedule.past_due_count
            ? fact(t('invoices.summary.overdue'), t('invoices.schedules.figure.pastDue', { count: schedule.past_due_count }), 'expense')
            : null}
        </View>
      </Card>

      {canWrite ? (
        <View style={styles.actions}>
          {actions.canGenerate ? (
            <Button label={t('invoices.schedules.action.generate')} onPress={runGenerate} loading={generate.isPending} />
          ) : null}
          {actions.canChangePrice ? (
            <Button
              label={t('invoices.schedules.action.changePrice')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/invoices/schedules/term', params: { scheduleId: schedule.id } })}
            />
          ) : null}
          {actions.canEdit ? (
            <Button
              label={t('common.edit')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/invoices/schedules/form', params: { id: schedule.id } })}
            />
          ) : null}
          {actions.canPause || actions.canResume ? (
            <Button
              label={actions.canPause ? t('invoices.schedules.action.pause') : t('invoices.schedules.action.resume')}
              variant="secondary"
              onPress={toggle}
              loading={action.isPending}
            />
          ) : null}
        </View>
      ) : null}

      <SectionHeader title={t('invoices.schedules.terms.title')} />
      <Text variant="caption" tone="muted">
        {t('invoices.schedules.terms.description')}
      </Text>
      <Card style={styles.list}>
        {terms.length === 0 ? (
          <ListRow title={t('invoices.schedules.noTerm')} />
        ) : (
          terms.map((term) => {
            const upcoming = isUpcomingTerm(term.effective_from)
            const editable = canWrite && actions.canChangePrice && upcoming
            const status = term.id === schedule.current_term?.id ? t('invoices.schedules.terms.current') : upcoming ? t('invoices.schedules.terms.upcoming') : null
            return (
              <ListRow
                key={term.id}
                title={t('invoices.schedules.terms.from', { date: date(term.effective_from) })}
                subtitle={[
                  status,
                  t('invoices.schedules.terms.perMonth', { amount: money(monthlyEquivalent(Number(term.total), schedule.frequency)) }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={
                  editable
                    ? () => router.push({ pathname: '/invoices/schedules/term', params: { scheduleId: schedule.id, termId: term.id } })
                    : undefined
                }
                showChevron={editable}
                trailing={<Text variant="label">{money(term.total)}</Text>}
              />
            )
          })
        )}
      </Card>
      <SectionHeader title={t('invoices.schedules.invoices.title')} />
      <Text variant="caption" tone="muted">
        {t('invoices.schedules.invoices.description')}
      </Text>
      <Card style={styles.list}>
        {invoices.isPending ? (
          <Loading />
        ) : invoices.isError ? (
          <ErrorState error={invoices.error} onRetry={() => invoices.refetch()} />
        ) : invoices.data.length === 0 ? (
          <ListRow
            title={
              schedule.next_period_start
                ? t('invoices.schedules.invoices.emptyNext', { date: date(schedule.next_period_start) })
                : t('invoices.schedules.invoices.empty')
            }
          />
        ) : (
          invoices.data.map((invoice) => (
            <ListRow
              key={invoice.id}
              title={
                invoice.period_start && invoice.period_end
                  ? periodLabel(invoice.period_start, invoice.period_end, dateLocale)
                  : (displayNumber(invoice, settings?.number_prefix) ?? t('invoices.noNumber'))
              }
              subtitle={[displayNumber(invoice, settings?.number_prefix), `${t('invoices.dueDate')} ${date(invoice.next_due_date ?? invoice.due_date)}`]
                .filter(Boolean)
                .join(' · ')}
              onPress={() => router.push({ pathname: '/invoices/[id]', params: { id: invoice.id } })}
              trailing={
                <View style={styles.trailing}>
                  <AmountText variant="label" value={Number(invoice.total)} currency={invoice.currency} />
                  <StateBadge state={invoice.state} />
                </View>
              }
            />
          ))
        )}
      </Card>
      {canWrite && actions.canLink ? (
        <Button
          label={t('invoices.schedules.action.linkInvoice')}
          variant="secondary"
          onPress={() => router.push({ pathname: '/invoices/schedules/link', params: { scheduleId: schedule.id } })}
        />
      ) : null}

      {schedule.notes ? (
        <>
          <SectionHeader title={t('invoices.notes')} />
          <Card>
            <Text>{schedule.notes}</Text>
          </Card>
        </>
      ) : null}

      {canWrite && (actions.canEnd || actions.canDelete) ? (
        <View style={styles.actions}>
          {actions.canEnd ? (
            <Button
              label={t('invoices.schedules.action.end')}
              variant="destructive"
              onPress={() => router.push({ pathname: '/invoices/schedules/end', params: { scheduleId: schedule.id } })}
            />
          ) : null}
          {actions.canDelete ? (
            <Button label={t('common.delete')} variant="ghost" onPress={confirmDelete} loading={remove.isPending} />
          ) : null}
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headline: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  facts: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md, marginTop: spacing.md },
  fact: { width: '50%', gap: 2 },
  list: { padding: 0, overflow: 'hidden' },
  actions: { gap: spacing.sm },
  trailing: { alignItems: 'flex-end', gap: spacing.xs },
})
