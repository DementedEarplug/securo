import { zodResolver } from '@hookform/resolvers/zod'
import { useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { DateField } from '@/components/DateField'
import { PickerField } from '@/components/PickerField'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SelectSheet } from '@/components/SelectSheet'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { usePayees } from '@/features/payees/hooks'
import { accountNameById, accountOptions, useAccounts } from '@/features/accounts/hooks'
import { useDisplayFormat } from '@/features/session/hooks'
import { spacing } from '@/theme'
import { categoryOptions } from './category-options'
import { transactionFormSchema, type LockableField, type TransactionFormValues } from './form'
import { useCategoryGroups } from './hooks'

const NONE_LOCKED = new Set<LockableField>()

interface Props {
  defaultValues: TransactionFormValues
  onSubmit: (values: TransactionFormValues) => Promise<void>
  submitLabel: string
  /** Fields that can't change here (see `lockedFields`). */
  locked?: Set<LockableField>
  /** Why some fields are locked, shown above the form. */
  lockedNotice?: string | null
  error?: string | null
  /** Shown above the save button (e.g. repeat options when creating). */
  extra?: ReactNode
  amountLabel?: string
}

export function TransactionForm({ defaultValues, onSubmit, submitLabel, locked = NONE_LOCKED, lockedNotice, error, extra, amountLabel }: Props) {
  const { t } = useTranslation()
  const { locale } = useDisplayFormat()
  const accounts = (useAccounts().data ?? []).filter((a) => !a.is_closed || a.id === defaultValues.accountId)
  const categories = categoryOptions(useCategoryGroups().data)
  const [picking, setPicking] = useState<'account' | 'category' | 'payee' | null>(null)
  const payees = usePayees().data ?? []

  const { control, handleSubmit, formState } = useForm<TransactionFormValues>({
    defaultValues,
    resolver: zodResolver(transactionFormSchema(locale)),
  })
  const message = (key?: string) => (key ? t(key) : null)

  return (
    <View style={styles.form}>
      {lockedNotice ? (
        <Text variant="caption" tone="muted">
          {lockedNotice}
        </Text>
      ) : null}

      <Controller
        control={control}
        name="type"
        render={({ field }) =>
          locked.has('type') ? (
            <View />
          ) : (
            <SegmentedControl
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: 'debit', label: t('transactions.expense') },
                { value: 'credit', label: t('transactions.income') },
              ]}
            />
          )
        }
      />
      <Controller
        control={control}
        name="amount"
        render={({ field, fieldState }) => (
          <TextField
            label={amountLabel ?? t('transactions.amount')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            keyboardType="decimal-pad"
            editable={!locked.has('amount')}
            placeholder="0"
            error={message(fieldState.error?.message)}
          />
        )}
      />
      <Controller
        control={control}
        name="description"
        render={({ field, fieldState }) => (
          <TextField
            label={t('transactions.description')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="sentences"
            error={message(fieldState.error?.message)}
          />
        )}
      />
      <Controller
        control={control}
        name="date"
        render={({ field }) =>
          locked.has('date') ? (
            <View />
          ) : (
            <DateField label={t('transactions.date')} value={field.value} onChange={field.onChange} />
          )
        }
      />
      <Controller
        control={control}
        name="accountId"
        render={({ field, fieldState }) => (
          <>
            <PickerField
              label={t('transactions.account')}
              value={accountNameById(accounts, field.value)}
              placeholder={t('transactions.form.chooseAccount')}
              onPress={() => !locked.has('account') && setPicking('account')}
              error={message(fieldState.error?.message)}
            />
            <SelectSheet
              visible={picking === 'account'}
              title={t('transactions.account')}
              options={accountOptions(accounts)}
              selected={field.value || null}
              onSelect={(id) => {
                if (id) field.onChange(id)
                setPicking(null)
              }}
              onClose={() => setPicking(null)}
            />
          </>
        )}
      />
      <Controller
        control={control}
        name="categoryId"
        render={({ field }) => (
          <>
            <PickerField
              label={t('transactions.category')}
              value={categories.find((c) => c.value === field.value)?.label ?? null}
              placeholder={t('transactions.uncategorized')}
              onPress={() => setPicking('category')}
            />
            <SelectSheet
              visible={picking === 'category'}
              title={t('transactions.category')}
              options={categories}
              selected={field.value}
              noneLabel={t('transactions.uncategorized')}
              onSelect={(id) => {
                field.onChange(id)
                setPicking(null)
              }}
              onClose={() => setPicking(null)}
            />
          </>
        )}
      />
      <Controller
        control={control}
        name="payeeId"
        render={({ field }) => (
          <>
            <PickerField
              label={t('transactions.payee')}
              value={payees.find((p) => p.id === field.value)?.name ?? null}
              placeholder={t('transactions.form.noPayee')}
              onPress={() => setPicking('payee')}
            />
            <SelectSheet
              visible={picking === 'payee'}
              title={t('transactions.payee')}
              options={[...payees]
                .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || a.name.localeCompare(b.name))
                .map((p) => ({ value: p.id, label: p.name }))}
              selected={field.value}
              noneLabel={t('transactions.form.noPayee')}
              onSelect={(id) => {
                field.onChange(id)
                setPicking(null)
              }}
              onClose={() => setPicking(null)}
            />
          </>
        )}
      />
      <Controller
        control={control}
        name="notes"
        render={({ field, fieldState }) => (
          <TextField
            label={t('transactions.notes')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            multiline
            style={styles.notes}
            error={message(fieldState.error?.message)}
          />
        )}
      />
      {extra}
      {error ? (
        <Text tone="destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button label={submitLabel} onPress={handleSubmit(onSubmit)} loading={formState.isSubmitting} />
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  notes: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
})
