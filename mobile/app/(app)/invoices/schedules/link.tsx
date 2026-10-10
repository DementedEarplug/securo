import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/Button'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SelectSheet } from '@/components/SelectSheet'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { useInvoiceSettings, useLinkableInvoices, useLinkInvoice, useSchedule, useSchedulePeriods } from '@/features/invoices/hooks'
import { displayNumber, invoiceErrorMessage } from '@/features/invoices/model'
import { periodLabel, type Schedule } from '@/features/invoices/schedules'
import { useDisplayFormat } from '@/features/session/hooks'
import { formatDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'

/** Tell a hand-written invoice which period of the agreement it was for. */
export default function LinkInvoiceScreen() {
  const { scheduleId } = useLocalSearchParams<{ scheduleId: string }>()
  const schedule = useSchedule(scheduleId)
  if (schedule.isPending) return <Loading />
  if (schedule.isError) return <ErrorState error={schedule.error} onRetry={() => schedule.refetch()} />
  return <LinkForm schedule={schedule.data} />
}

function LinkForm({ schedule }: { schedule: Schedule }) {
  const { t } = useTranslation()
  const { locale, dateLocale } = useDisplayFormat()
  const settings = useInvoiceSettings().data
  const periods = useSchedulePeriods(schedule.id)
  const candidates = useLinkableInvoices(schedule)
  const link = useLinkInvoice(schedule.id)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [periodStart, setPeriodStart] = useState<string | null>(null)
  const [picking, setPicking] = useState<'invoice' | 'period' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (periods.isPending || candidates.isPending) return <Loading />
  if (periods.isError) return <ErrorState error={periods.error} onRetry={() => periods.refetch()} />
  if (candidates.isError) return <ErrorState error={candidates.error} onRetry={() => candidates.refetch()} />

  const free = periods.data.filter((p) => !p.taken)
  const invoiceOptions = candidates.data.map((invoice) => ({
    value: invoice.id,
    label: `${displayNumber(invoice, settings?.number_prefix) ?? t('invoices.noNumber')} · ${formatCurrency(Number(invoice.total), invoice.currency, locale)}`,
    detail: formatDate(invoice.issue_date, dateLocale),
  }))
  const periodOptions = free.map((p) => ({ value: p.period_start, label: periodLabel(p.period_start, p.period_end, dateLocale), detail: `#${p.sequence}` }))

  const submit = async () => {
    if (!invoiceId || !periodStart) return
    setError(null)
    try {
      await link.mutateAsync({ invoice_id: invoiceId, period_start: periodStart })
      router.back()
    } catch (e) {
      setError(invoiceErrorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Text variant="caption" tone="muted">
        {t('invoices.schedules.linkDescription')}
      </Text>
      <PickerField
        label={t('invoices.schedules.field.invoice')}
        value={invoiceOptions.find((o) => o.value === invoiceId)?.label ?? null}
        placeholder={t('invoices.schedules.field.invoicePlaceholder')}
        onPress={() => setPicking('invoice')}
      />
      {invoiceOptions.length === 0 ? (
        <Text variant="caption" tone="muted">
          {t('invoices.schedules.noCandidates')}
        </Text>
      ) : null}
      <PickerField
        label={t('invoices.schedules.field.period')}
        value={periodOptions.find((o) => o.value === periodStart)?.label ?? null}
        placeholder={t('invoices.schedules.field.periodPlaceholder')}
        onPress={() => setPicking('period')}
      />
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('invoices.schedules.action.link')} onPress={submit} loading={link.isPending} disabled={!invoiceId || !periodStart} />
      <SelectSheet
        visible={picking === 'invoice'}
        title={t('invoices.schedules.field.invoice')}
        options={invoiceOptions}
        selected={invoiceId}
        onSelect={(value) => {
          setInvoiceId(value)
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'period'}
        title={t('invoices.schedules.field.period')}
        options={periodOptions}
        selected={periodStart}
        onSelect={(value) => {
          setPeriodStart(value)
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
    </Screen>
  )
}
