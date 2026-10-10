import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/Button'
import { DateField } from '@/components/DateField'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useDeleteTerm, useInvoiceSettings, useSaveTerm, useSchedule } from '@/features/invoices/hooks'
import { LinesEditor } from '@/features/invoices/LinesEditor'
import { emptyLine, invoiceErrorMessage, lineValuesFrom, type InvoiceSettings } from '@/features/invoices/model'
import {
  isUpcomingTerm,
  localToday,
  monthlyEquivalent,
  sortTerms,
  termPerPeriod,
  toTermPayload,
  validateTerm,
  type Schedule,
  type TermValues,
} from '@/features/invoices/schedules'
import { useDisplayFormat } from '@/features/session/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { formatDate } from '@/lib/dates'
import { formatAmountInput, formatCurrency } from '@/lib/format'

/** A price from a date on (`?termId=` edits an upcoming one): the web's "Change price". */
export default function TermScreen() {
  const { scheduleId, termId } = useLocalSearchParams<{ scheduleId: string; termId?: string }>()
  const schedule = useSchedule(scheduleId)
  const settings = useInvoiceSettings()
  if (schedule.isPending || settings.isPending) return <Loading />
  if (schedule.isError) return <ErrorState error={schedule.error} onRetry={() => schedule.refetch()} />
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
  return <TermForm schedule={schedule.data} termId={termId} settings={settings.data} />
}

type LineSource = Parameters<typeof lineValuesFrom>[0]

function TermForm({ schedule, termId, settings }: { schedule: Schedule; termId?: string; settings: InvoiceSettings }) {
  const { t } = useTranslation()
  const { locale, dateLocale } = useDisplayFormat()
  const save = useSaveTerm(schedule.id)
  const remove = useDeleteTerm(schedule.id)
  const terms = sortTerms(schedule.terms ?? [])
  const term = termId ? terms.find((row) => row.id === termId) : undefined
  // A new price starts from what is billed now (or next), so a raise is one edit.
  const source = term ?? schedule.next_term ?? schedule.current_term
  const [v, setV] = useState<TermValues>(() => ({
    effectiveFrom: term?.effective_from ?? schedule.next_period_start ?? localToday(),
    lines: source ? lineValuesFrom(source.lines as LineSource, locale) : [emptyLine()],
    discount: source && Number(source.discount) > 0 ? formatAmountInput(Number(source.discount), locale) : '',
  }))
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<TermValues>) => setV((current) => ({ ...current, ...patch }))
  const perPeriod = termPerPeriod(v, locale)
  const money = (n: number) => formatCurrency(n, schedule.currency, locale)
  // The price in force from the start can't be moved or removed.
  const removable = Boolean(term && term.id !== terms[0]?.id && isUpcomingTerm(term.effective_from))

  const submit = async () => {
    const problem = validateTerm(v, locale)
    if (problem) return setError(t(problem))
    setError(null)
    try {
      await save.mutateAsync({ termId: term?.id, body: toTermPayload(v, locale, settings.tax_fields !== 'hidden') })
      router.back()
    } catch (e) {
      setError(invoiceErrorMessage(e, t))
    }
  }

  const confirmRemove = async () => {
    if (!term) return
    if (
      !(await confirmDestructive(
        t('invoices.schedules.confirm.removeTermTitle'),
        t('invoices.schedules.confirm.removeTermBody'),
        t('invoices.schedules.terms.remove'),
      ))
    )
      return
    try {
      await remove.mutateAsync(term.id)
      router.back()
    } catch (e) {
      showError(invoiceErrorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: term ? t('invoices.schedules.terms.editTitle') : t('invoices.schedules.action.changePrice') }} />
      <Text variant="caption" tone="muted">
        {t('invoices.schedules.terms.changeDescription')}
      </Text>
      <DateField label={t('invoices.schedules.terms.effectiveFrom')} value={v.effectiveFrom} onChange={(effectiveFrom) => set({ effectiveFrom })} />
      {schedule.next_period_start ? (
        <Text variant="caption" tone="muted">
          {t('invoices.schedules.terms.nextPeriodHint', { date: formatDate(schedule.next_period_start, dateLocale) })}
        </Text>
      ) : null}
      <SectionHeader title={t('invoices.field.lines')} />
      <LinesEditor
        lines={v.lines}
        onChange={(lines) => set({ lines })}
        currency={schedule.currency}
        locale={locale}
        showTax={settings.tax_fields !== 'hidden'}
        required
      />
      <TextField
        label={t('invoices.schedules.terms.discount')}
        value={v.discount}
        onChangeText={(discount) => set({ discount })}
        keyboardType="decimal-pad"
        placeholder="0"
      />
      <Text variant="caption" tone="muted">
        {t('invoices.schedules.terms.preview', {
          period: money(Math.max(0, perPeriod)),
          monthly: money(monthlyEquivalent(Math.max(0, perPeriod), schedule.frequency)),
        })}
      </Text>
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={save.isPending} />
      {removable ? <Button label={t('invoices.schedules.terms.remove')} variant="ghost" onPress={confirmRemove} loading={remove.isPending} /> : null}
    </Screen>
  )
}
