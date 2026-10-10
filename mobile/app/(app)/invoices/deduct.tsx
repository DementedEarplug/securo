import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/Button'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SelectSheet } from '@/components/SelectSheet'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useInvoice, useRecordDeduction } from '@/features/invoices/hooks'
import { DEDUCTION_KINDS, invoiceErrorMessage, type DeductionKind, type Invoice } from '@/features/invoices/model'
import { useDisplayFormat } from '@/features/session/hooks'
import { formatCurrency, parseAmountInput } from '@/lib/format'

/** Record what closes part of an invoice without money arriving. */
export default function RecordDeductionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const invoice = useInvoice(id)
  if (invoice.isPending) return <Loading />
  if (invoice.isError) return <ErrorState error={invoice.error} onRetry={() => invoice.refetch()} />
  return <RecordDeduction invoice={invoice.data} />
}

function RecordDeduction({ invoice }: { invoice: Invoice }) {
  const { t } = useTranslation()
  const { locale } = useDisplayFormat()
  const record = useRecordDeduction(invoice.id)
  const [kind, setKind] = useState<DeductionKind>('withholding_tax')
  const [amount, setAmount] = useState('')
  const [taxKind, setTaxKind] = useState('')
  const [note, setNote] = useState('')
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const value = parseAmountInput(amount, locale)
    if (value === null || value <= 0) return setError(t('invoices.deductForm.amountRequired'))
    setError(null)
    try {
      await record.mutateAsync({
        kind,
        amount: String(value),
        tax_kind: kind === 'withholding_tax' ? taxKind.trim() || null : null,
        note: note.trim() || null,
      })
      router.back()
    } catch (e) {
      setError(invoiceErrorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Text variant="caption" tone="muted">
        {t('invoices.deductions.description')}
      </Text>
      <PickerField
        label={t('invoices.deductions.kindLabel')}
        value={t(`invoices.deductions.kind.${kind}`)}
        placeholder=""
        onPress={() => setPicking(true)}
      />
      <TextField label={t('invoices.deductions.amount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
      <Text variant="caption" tone="muted">
        {t('invoices.deductions.amountHint', { balance: formatCurrency(Number(invoice.balance), invoice.currency, locale) })}
      </Text>
      {kind === 'withholding_tax' ? (
        <TextField
          label={t('invoices.deductions.taxKind')}
          value={taxKind}
          onChangeText={setTaxKind}
          placeholder={t('invoices.deductions.taxKindPlaceholder')}
          maxLength={30}
          autoCapitalize="characters"
        />
      ) : null}
      <TextField label={t('invoices.deductions.note')} value={note} onChangeText={setNote} maxLength={500} />
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('invoices.deductions.action')} onPress={submit} loading={record.isPending} />
      <SelectSheet
        visible={picking}
        title={t('invoices.deductions.kindLabel')}
        options={DEDUCTION_KINDS.map((value) => ({ value, label: t(`invoices.deductions.kind.${value}`) }))}
        selected={kind}
        onSelect={(value) => {
          if (value) setKind(value as DeductionKind)
          setPicking(false)
        }}
        onClose={() => setPicking(false)}
      />
    </Screen>
  )
}
