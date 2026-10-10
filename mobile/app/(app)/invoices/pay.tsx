import { router, useLocalSearchParams } from 'expo-router'
import Check from 'lucide-react-native/icons/check'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { SelectSheet } from '@/components/SelectSheet'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useInvoice, useRecordPayment, useSettlingTransactions } from '@/features/invoices/hooks'
import {
  DEDUCTION_KINDS,
  invoiceErrorMessage,
  paymentCandidates,
  paymentShortfall,
  type DeductionKind,
  type Invoice,
} from '@/features/invoices/model'
import { useDisplayFormat } from '@/features/session/hooks'
import { showError } from '@/lib/confirm'
import { formatDate } from '@/lib/dates'
import { formatCurrency, parseAmountInput } from '@/lib/format'
import { spacing, useColors } from '@/theme'

/** Link the money that settled an invoice, as the web's "Mark as paid". */
export default function RecordPaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const invoice = useInvoice(id)
  if (invoice.isPending) return <Loading />
  if (invoice.isError) return <ErrorState error={invoice.error} onRetry={() => invoice.refetch()} />
  return <RecordPayment invoice={invoice.data} />
}

function RecordPayment({ invoice }: { invoice: Invoice }) {
  const { t } = useTranslation()
  const colors = useColors()
  const { locale, dateLocale } = useDisplayFormat()
  const transactions = useSettlingTransactions(invoice.direction)
  const record = useRecordPayment(invoice.id)
  const [selected, setSelected] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [differenceKind, setDifferenceKind] = useState<DeductionKind | null>(null)
  const [pickingKind, setPickingKind] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const money = (value: number) => formatCurrency(value, invoice.currency, locale)

  if (transactions.isPending) return <Loading />
  if (transactions.isError) return <ErrorState error={transactions.error} onRetry={() => transactions.refetch()} />

  const candidates = paymentCandidates(transactions.data.items, invoice)
  const selectedTx = candidates.find((tx) => tx.id === selected)
  const balance = Number(invoice.balance)
  // What this payment is expected to cover: the next installment's remainder, or the balance.
  const next = (invoice.installments ?? []).find((row) => row.state !== 'paid')
  const target = next ? Number(next.amount) - Number(next.settled ?? 0) : balance
  const typed = amount.trim() ? parseAmountInput(amount, locale) : null
  const shortfall = selectedTx ? paymentShortfall(target, balance, Number(selectedTx.amount), typed) : 0

  const submit = async () => {
    if (!selected) return setError(t('invoices.pay.choose'))
    if (amount.trim() && (typed === null || typed <= 0)) return setError(t('invoices.errors.amount_not_positive'))
    setError(null)
    try {
      const result = await record.mutateAsync({
        transactionId: selected,
        amount: typed === null ? undefined : String(typed),
        shortfall: differenceKind && shortfall > 0 ? { kind: differenceKind, amount: shortfall.toFixed(2) } : undefined,
      })
      // The link landed either way; a failed deduction is reported, not retried.
      if (result.deductionError) {
        showError(t('invoices.pay.partialLinkError', { error: invoiceErrorMessage(result.deductionError, t) }))
      }
      router.back()
    } catch (e) {
      setError(invoiceErrorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Text variant="caption" tone="muted">
        {t('invoices.linkDescription')}
      </Text>

      <SectionHeader title={t('invoices.pay.choose')} />
      <Card style={styles.list}>
        {candidates.length === 0 ? (
          <ListRow title={t('invoices.noCandidates')} />
        ) : (
          candidates.map((tx) => (
            <ListRow
              key={tx.id}
              title={tx.description}
              subtitle={formatDate(tx.date, dateLocale)}
              onPress={() => setSelected(tx.id === selected ? null : tx.id)}
              accessibilityLabel={`${tx.description}, ${money(Math.abs(Number(tx.amount)))}`}
              trailing={
                <View style={styles.trailing}>
                  <Text variant="label">{money(Math.abs(Number(tx.amount)))}</Text>
                  {tx.id === selected ? <Check color={colors.primary} size={18} /> : null}
                </View>
              }
            />
          ))
        )}
      </Card>

      <TextField
        label={t('invoices.field.amountToApply')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder={t('invoices.pay.amountPlaceholder', { amount: money(balance) })}
      />
      <Text variant="caption" tone="muted">
        {t('invoices.field.amountHint')}
      </Text>

      {selectedTx && shortfall > 0 ? (
        <Card>
          <Text variant="label">{t('invoices.deductions.differenceTitle', { difference: money(shortfall) })}</Text>
          <Text variant="caption" tone="muted">
            {t('invoices.deductions.differenceHint')}
          </Text>
          <PickerField
            label={t('invoices.deductions.kindLabel')}
            value={differenceKind ? t(`invoices.deductions.kind.${differenceKind}`) : t('invoices.deductions.differenceNone')}
            placeholder={t('invoices.deductions.differenceNone')}
            onPress={() => setPickingKind(true)}
          />
        </Card>
      ) : null}

      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('invoices.action.link')} onPress={submit} loading={record.isPending} disabled={!selected} />

      <SelectSheet
        visible={pickingKind}
        title={t('invoices.deductions.kindLabel')}
        options={DEDUCTION_KINDS.map((kind) => ({ value: kind, label: t(`invoices.deductions.kind.${kind}`) }))}
        noneLabel={t('invoices.deductions.differenceNone')}
        selected={differenceKind}
        onSelect={(kind) => {
          setDifferenceKind(kind as DeductionKind | null)
          setPickingKind(false)
        }}
        onClose={() => setPickingKind(false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden' },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
})
