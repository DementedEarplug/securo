import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import type { Account } from '@/api/types'
import { Button } from '@/components/Button'
import { DateField } from '@/components/DateField'
import { PickerField } from '@/components/PickerField'
import { SelectSheet } from '@/components/SelectSheet'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { accountNameById, accountOptions } from '@/features/accounts/hooks'
import { toIsoDate } from '@/lib/dates'
import { parseAmountInput } from '@/lib/format'
import { spacing } from '@/theme'

export interface TransferValues {
  fromAccountId: string
  toAccountId: string
  amount: string
  /** Only for transfers between currencies: what arrived. */
  destinationAmount: string
  date: string
  description: string
  notes: string
}

export function transferErrors(values: TransferValues, locale: string, crossCurrency: boolean): Partial<Record<keyof TransferValues, string>> {
  const errors: Partial<Record<keyof TransferValues, string>> = {}
  if (!values.fromAccountId) errors.fromAccountId = 'transactions.transfer.fromRequired'
  if (!values.toAccountId) errors.toAccountId = 'transactions.transfer.toRequired'
  if (values.fromAccountId && values.fromAccountId === values.toAccountId) errors.toAccountId = 'transactions.transfer.sameAccount'
  if ((parseAmountInput(values.amount, locale) ?? 0) <= 0) errors.amount = 'transactions.form.amountInvalid'
  if (crossCurrency && values.destinationAmount.trim() && (parseAmountInput(values.destinationAmount, locale) ?? 0) <= 0)
    errors.destinationAmount = 'transactions.form.amountInvalid'
  if (!values.description.trim()) errors.description = 'transactions.form.descriptionRequired'
  return errors
}

export function toTransferCreate(values: TransferValues, locale: string, crossCurrency: boolean) {
  const destination = crossCurrency && values.destinationAmount.trim() ? String(parseAmountInput(values.destinationAmount, locale)) : null
  return {
    from_account_id: values.fromAccountId,
    to_account_id: values.toAccountId,
    amount: String(parseAmountInput(values.amount, locale)),
    date: values.date,
    description: values.description.trim(),
    notes: values.notes.trim() || null,
    // The server rejects a destination amount between same-currency accounts.
    ...(destination ? { destination_amount: destination } : {}),
  }
}

/** Move money between two of the user's accounts (both legs are created together). */
export function TransferForm({
  accounts,
  locale,
  onSubmit,
  submitting,
  error,
}: {
  accounts: Account[]
  locale: string
  onSubmit: (body: ReturnType<typeof toTransferCreate>) => void
  submitting: boolean
  error: string | null
}) {
  const { t } = useTranslation()
  const [values, setValues] = useState<TransferValues>({
    fromAccountId: accounts[0]?.id ?? '',
    toAccountId: '',
    amount: '',
    destinationAmount: '',
    date: toIsoDate(new Date()),
    description: t('transactions.transfer.defaultDescription'),
    notes: '',
  })
  const [picking, setPicking] = useState<'from' | 'to' | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const from = accounts.find((a) => a.id === values.fromAccountId)
  const to = accounts.find((a) => a.id === values.toAccountId)
  const crossCurrency = Boolean(from && to && from.currency !== to.currency)
  const errors = transferErrors(values, locale, crossCurrency)
  const message = (key: keyof TransferValues) => (showErrors && errors[key] ? t(errors[key]!) : null)
  const set = (patch: Partial<TransferValues>) => setValues({ ...values, ...patch })

  const submit = () => {
    setShowErrors(true)
    if (Object.keys(errors).length === 0) onSubmit(toTransferCreate(values, locale, crossCurrency))
  }

  return (
    <View style={styles.form}>
      <PickerField
        label={t('transactions.transfer.from')}
        value={accountNameById(accounts, values.fromAccountId)}
        placeholder={t('transactions.form.chooseAccount')}
        onPress={() => setPicking('from')}
        error={message('fromAccountId')}
      />
      <PickerField
        label={t('transactions.transfer.to')}
        value={accountNameById(accounts, values.toAccountId)}
        placeholder={t('transactions.form.chooseAccount')}
        onPress={() => setPicking('to')}
        error={message('toAccountId')}
      />
      <TextField
        label={crossCurrency ? t('transactions.transfer.amountSent', { currency: from?.currency }) : t('transactions.amount')}
        value={values.amount}
        onChangeText={(amount) => set({ amount })}
        keyboardType="decimal-pad"
        placeholder="0"
        error={message('amount')}
      />
      {crossCurrency ? (
        <>
          <TextField
            label={t('transactions.transfer.amountReceived', { currency: to?.currency })}
            value={values.destinationAmount}
            onChangeText={(destinationAmount) => set({ destinationAmount })}
            keyboardType="decimal-pad"
            placeholder={t('transactions.transfer.marketRate')}
            error={message('destinationAmount')}
          />
          <Text variant="caption" tone="muted">
            {t('transactions.transfer.crossCurrencyHint')}
          </Text>
        </>
      ) : null}
      <TextField label={t('transactions.description')} value={values.description} onChangeText={(description) => set({ description })} error={message('description')} />
      <DateField label={t('transactions.date')} value={values.date} onChange={(date) => set({ date })} />
      <TextField label={t('transactions.notes')} value={values.notes} onChangeText={(notes) => set({ notes })} multiline style={styles.notes} />
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={submitting} />
      <SelectSheet
        visible={picking !== null}
        title={picking === 'to' ? t('transactions.transfer.to') : t('transactions.transfer.from')}
        // The other side of the transfer can't also be this side.
        options={accountOptions(accounts).filter((o) => o.value !== (picking === 'to' ? values.fromAccountId : values.toAccountId))}
        selected={picking === 'to' ? values.toAccountId || null : values.fromAccountId || null}
        onSelect={(id) => {
          if (id) set(picking === 'to' ? { toAccountId: id } : { fromAccountId: id })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  notes: { minHeight: 72, paddingTop: spacing.md, textAlignVertical: 'top' },
})
