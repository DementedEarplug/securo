import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { DateField } from '@/components/DateField'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { SelectSheet } from '@/components/SelectSheet'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useCurrencies } from '@/features/accounts/hooks'
import { EndFields } from '@/features/invoices/EndFields'
import {
  useCreateSchedule,
  useInvoice,
  useInvoiceSettings,
  useMakeRecurring,
  useSchedule,
  useUpdateSchedule,
} from '@/features/invoices/hooks'
import { LinesEditor } from '@/features/invoices/LinesEditor'
import { emptyLine, invoiceErrorMessage, linesTotal, type Invoice, type InvoiceSettings } from '@/features/invoices/model'
import {
  FREQUENCIES,
  localToday,
  monthlyEquivalent,
  toMakeRecurring,
  toScheduleCreate,
  toScheduleUpdate,
  validateEnd,
  validateScheduleForm,
  type Schedule,
  type ScheduleFormValues,
  type ScheduleFrequency,
} from '@/features/invoices/schedules'
import { usePayees } from '@/features/payees/hooks'
import { useDisplayFormat } from '@/features/session/hooks'
import { formatDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { spacing } from '@/theme'

/**
 * A recurring invoice: new (no params), edited (`?id=`), or born from an
 * issued invoice (`?invoiceId=`, the web's "Repeat this invoice").
 */
export default function ScheduleFormScreen() {
  const { id, invoiceId } = useLocalSearchParams<{ id?: string; invoiceId?: string }>()
  const schedule = useSchedule(id ?? '')
  const invoice = useInvoice(invoiceId ?? '')
  const settings = useInvoiceSettings()
  if ((id && schedule.isPending) || (invoiceId && invoice.isPending) || settings.isPending) return <Loading />
  if (id && schedule.isError) return <ErrorState error={schedule.error} onRetry={() => schedule.refetch()} />
  if (invoiceId && invoice.isError) return <ErrorState error={invoice.error} onRetry={() => invoice.refetch()} />
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
  if (invoiceId && invoice.data) return <MakeRecurringForm invoice={invoice.data} />
  return <ScheduleForm schedule={id ? schedule.data : undefined} settings={settings.data} />
}

function FrequencyField({ value, onChange, disabled }: { value: ScheduleFrequency; onChange: (f: ScheduleFrequency) => void; disabled?: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <PickerField
        label={t('invoices.schedules.field.frequency')}
        value={t(`invoices.schedules.frequency.${value}`)}
        placeholder=""
        onPress={() => (disabled ? undefined : setOpen(true))}
      />
      <SelectSheet
        visible={open}
        title={t('invoices.schedules.field.frequency')}
        options={FREQUENCIES.map((f) => ({ value: f, label: t(`invoices.schedules.frequency.${f}`) }))}
        selected={value}
        onSelect={(f) => {
          if (f) onChange(f as ScheduleFrequency)
          setOpen(false)
        }}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

function ScheduleForm({ schedule, settings }: { schedule?: Schedule; settings: InvoiceSettings }) {
  const { t } = useTranslation()
  const { locale, dateLocale, currency } = useDisplayFormat()
  const payees = usePayees().data ?? []
  const currencies = useCurrencies().data ?? []
  const create = useCreateSchedule()
  const update = useUpdateSchedule(schedule?.id ?? '')
  const showTax = settings.tax_fields !== 'hidden'
  // Frequency and start are fixed once an invoice exists under the agreement.
  const locked = (schedule?.invoice_count ?? 0) > 0
  const [picking, setPicking] = useState<'payee' | 'currency' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState<ScheduleFormValues>(() => ({
    name: schedule?.name ?? '',
    payeeId: schedule?.payee_id ?? null,
    frequency: schedule?.frequency ?? 'monthly',
    startDate: schedule?.start_date ?? localToday(),
    paymentTerms: schedule?.payment_terms_days == null ? '' : String(schedule.payment_terms_days),
    currency: schedule?.currency ?? currency,
    notes: schedule?.notes ?? '',
    endType: schedule?.end_type ?? 'never',
    endDate: schedule?.end_date ?? null,
    endCount: schedule?.end_count ? String(schedule.end_count) : '',
    lines: [emptyLine()],
  }))
  const set = (patch: Partial<ScheduleFormValues>) => setV((current) => ({ ...current, ...patch }))
  const perPeriod = linesTotal(v.lines, locale)

  const submit = async () => {
    const problem = validateScheduleForm(v, locale, { withLines: !schedule })
    if (problem) return setError(t(problem))
    setError(null)
    try {
      if (schedule) {
        await update.mutateAsync(toScheduleUpdate(v, { locked }))
        router.back()
      } else {
        const created = await create.mutateAsync(toScheduleCreate(v, locale, showTax))
        router.replace({ pathname: '/invoices/schedules/[id]', params: { id: created.id } })
      }
    } catch (e) {
      setError(invoiceErrorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: schedule ? t('invoices.schedules.editTitle') : t('invoices.schedules.new') }} />
      <Text variant="caption" tone="muted">
        {schedule
          ? locked
            ? t('invoices.schedules.editLockedDescription')
            : t('invoices.schedules.editDescription')
          : t('invoices.schedules.newDescription')}
      </Text>
      <TextField
        label={t('invoices.schedules.field.name')}
        value={v.name}
        onChangeText={(name) => set({ name })}
        placeholder={t('invoices.schedules.field.namePlaceholder')}
        maxLength={200}
      />
      <PickerField
        label={t('invoices.field.client')}
        value={payees.find((p) => p.id === v.payeeId)?.name ?? schedule?.payee?.name ?? null}
        placeholder={t('invoices.field.clientPlaceholder')}
        onPress={() => setPicking('payee')}
      />
      <FrequencyField value={v.frequency} onChange={(frequency) => set({ frequency })} disabled={locked} />
      {locked ? (
        <PickerField label={t('invoices.schedules.field.startDate')} value={formatDate(v.startDate, dateLocale)} placeholder="" onPress={() => undefined} />
      ) : (
        <DateField label={t('invoices.schedules.field.startDate')} value={v.startDate} onChange={(startDate) => set({ startDate })} />
      )}
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label={t('invoices.schedules.field.paymentTerms')}
            value={v.paymentTerms}
            onChangeText={(paymentTerms) => set({ paymentTerms })}
            keyboardType="number-pad"
            placeholder={t('invoices.schedules.form.termsPlaceholder', { days: settings.default_payment_terms_days })}
            maxLength={3}
          />
        </View>
        {schedule ? null : (
          <View style={styles.currency}>
            <PickerField label={t('invoices.schedules.field.currency')} value={v.currency} placeholder="" onPress={() => setPicking('currency')} />
          </View>
        )}
      </View>
      <EndFields value={v} onChange={set} />

      {schedule ? null : (
        <>
          <SectionHeader title={t('invoices.field.lines')} />
          <LinesEditor lines={v.lines} onChange={(lines) => set({ lines })} currency={v.currency} locale={locale} showTax={showTax} required />
          <Text variant="caption" tone="muted">
            {t('invoices.schedules.monthlyPreview', { amount: formatCurrency(monthlyEquivalent(perPeriod, v.frequency), v.currency, locale) })}
          </Text>
        </>
      )}

      <TextField
        label={t('invoices.schedules.form.notes')}
        value={v.notes}
        onChangeText={(notes) => set({ notes })}
        multiline
        style={styles.notes}
      />
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={create.isPending || update.isPending} />

      <SelectSheet
        visible={picking === 'payee'}
        title={t('invoices.field.client')}
        options={payees.map((p) => ({ value: p.id, label: p.name }))}
        noneLabel={t('invoices.noClient')}
        selected={v.payeeId}
        onSelect={(payeeId) => {
          set({ payeeId })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'currency'}
        title={t('invoices.schedules.field.currency')}
        options={currencies.map((c) => ({ value: c.code, label: `${c.flag ?? ''} ${c.code}`.trim(), detail: c.name }))}
        selected={v.currency}
        onSelect={(code) => {
          if (code) set({ currency: code })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
    </Screen>
  )
}

function MakeRecurringForm({ invoice }: { invoice: Invoice }) {
  const { t } = useTranslation()
  const { dateLocale } = useDisplayFormat()
  const make = useMakeRecurring(invoice.id)
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState({
    name: invoice.lines?.[0]?.description ?? invoice.payee?.name ?? '',
    frequency: 'monthly' as ScheduleFrequency,
    // The invoice's own date by default. Earlier makes it a later period,
    // so the ones billed by hand before it can be linked.
    startDate: invoice.issue_date,
    endType: 'never' as ScheduleFormValues['endType'],
    endDate: null as string | null,
    endCount: '',
  })
  const set = (patch: Partial<typeof v>) => setV((current) => ({ ...current, ...patch }))

  const submit = async () => {
    if (!v.name.trim()) return setError(t('invoices.errors.name_required'))
    if (v.startDate > invoice.issue_date) return setError(t('invoices.errors.start_after_invoice'))
    const end = validateEnd(v)
    if (end) return setError(t(end))
    setError(null)
    try {
      const schedule = await make.mutateAsync(toMakeRecurring(v))
      router.replace({ pathname: '/invoices/schedules/[id]', params: { id: schedule.id } })
    } catch (e) {
      setError(invoiceErrorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('invoices.schedules.action.makeRecurring') }} />
      <Text variant="caption" tone="muted">
        {t('invoices.schedules.makeRecurringDescription', { date: formatDate(invoice.issue_date, dateLocale) })}
      </Text>
      <TextField
        label={t('invoices.schedules.field.name')}
        value={v.name}
        onChangeText={(name) => set({ name })}
        placeholder={t('invoices.schedules.field.namePlaceholder')}
        maxLength={200}
      />
      <FrequencyField value={v.frequency} onChange={(frequency) => set({ frequency })} />
      <DateField label={t('invoices.schedules.field.startDate')} value={v.startDate} onChange={(startDate) => set({ startDate })} />
      <Text variant="caption" tone="muted">
        {t('invoices.schedules.field.startDateHint')}
      </Text>
      <EndFields value={v} onChange={set} />
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('invoices.schedules.action.makeRecurring')} onPress={submit} loading={make.isPending} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  flex: { flex: 1 },
  currency: { width: 120 },
  notes: { minHeight: 72, paddingTop: spacing.md, textAlignVertical: 'top' },
})
