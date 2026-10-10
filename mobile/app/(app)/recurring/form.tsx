import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { DateField } from '@/components/DateField'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SelectSheet } from '@/components/SelectSheet'
import { Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { accountNameById, accountOptions, useAccounts } from '@/features/accounts/hooks'
import { useCreateRecurring, useDeleteRecurring, useRecurring, useUpdateRecurring, type Recurring } from '@/features/recurring/hooks'
import { useDisplayFormat } from '@/features/session/hooks'
import { categoryOptions } from '@/features/transactions/category-options'
import { useCategoryGroups } from '@/features/transactions/hooks'
import { FREQUENCIES, type Frequency } from '@/features/transactions/repeat'
import { confirmDestructive, showError } from '@/lib/confirm'
import { toIsoDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatAmountInput, parseAmountInput } from '@/lib/format'
import { spacing } from '@/theme'

const WEEKEND = ['none', 'previous_friday', 'next_monday'] as const

export default function RecurringFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const recurring = useRecurring()
  if (id && recurring.isPending) return <Loading />
  return <RecurringForm item={id ? recurring.data?.find((r) => r.id === id) : undefined} />
}

function RecurringForm({ item }: { item?: Recurring }) {
  const { t } = useTranslation()
  const { locale } = useDisplayFormat()
  const accounts = (useAccounts().data ?? []).filter((a) => !a.is_closed || a.id === item?.account_id)
  const categories = categoryOptions(useCategoryGroups().data)
  const create = useCreateRecurring()
  const update = useUpdateRecurring(item?.id ?? '')
  const remove = useDeleteRecurring()
  const [picking, setPicking] = useState<'account' | 'category' | 'frequency' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState({
    description: item?.description ?? '',
    amount: item ? formatAmountInput(Number(item.amount), locale) : '',
    type: (item?.type as 'debit' | 'credit') ?? 'debit',
    accountId: item?.account_id ?? accounts[0]?.id ?? '',
    categoryId: item?.category_id ?? null,
    frequency: (item?.frequency as Frequency | undefined) ?? 'monthly',
    startDate: item?.start_date ?? toIsoDate(new Date()),
    endDate: item?.end_date ?? null,
    dayOfMonth: item?.day_of_month?.toString() ?? '',
    weekend: (item?.weekend_adjustment as (typeof WEEKEND)[number]) ?? 'none',
    autoGenerate: item?.auto_generate ?? true,
    isActive: item?.is_active ?? true,
  })
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch })
  const account = accounts.find((a) => a.id === v.accountId)

  const submit = async () => {
    const amount = parseAmountInput(v.amount, locale)
    const day = v.dayOfMonth.trim() ? Number(v.dayOfMonth) : null
    if (!v.description.trim()) return setError(t('transactions.form.descriptionRequired'))
    if (amount === null || amount <= 0) return setError(t('transactions.form.amountInvalid'))
    if (!v.accountId) return setError(t('transactions.form.accountRequired'))
    if (day !== null && !(Number.isInteger(day) && day >= 1 && day <= 31)) return setError(t('accounts.form.dayInvalid'))
    setError(null)
    const body = {
      description: v.description.trim(),
      amount: String(amount),
      type: v.type,
      account_id: v.accountId,
      category_id: v.categoryId,
      currency: account?.currency ?? 'USD',
      frequency: v.frequency,
      start_date: v.startDate,
      end_date: v.endDate,
      day_of_month: day,
      weekend_adjustment: v.weekend,
      auto_generate: v.autoGenerate,
    }
    try {
      if (item) await update.mutateAsync({ ...body, is_active: v.isActive })
      else await create.mutateAsync(body)
      router.back()
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const confirmDelete = async () => {
    if (!item || !(await confirmDestructive(t('recurring.deleteTitle'), t('recurring.deleteBody')))) return
    try {
      await remove.mutateAsync(item.id)
      router.back()
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: item ? t('recurring.editTitle') : t('recurring.newTitle') }} />
      <SegmentedControl
        value={v.type}
        onChange={(type) => set({ type })}
        options={[
          { value: 'debit', label: t('transactions.expense') },
          { value: 'credit', label: t('transactions.income') },
        ]}
      />
      <TextField label={t('transactions.amount')} value={v.amount} onChangeText={(amount) => set({ amount })} keyboardType="decimal-pad" placeholder="0" />
      <TextField label={t('transactions.description')} value={v.description} onChangeText={(description) => set({ description })} />
      <PickerField label={t('transactions.account')} value={accountNameById(accounts, v.accountId)} placeholder={t('transactions.form.chooseAccount')} onPress={() => setPicking('account')} />
      <PickerField
        label={t('transactions.category')}
        value={categories.find((c) => c.value === v.categoryId)?.label ?? null}
        placeholder={t('transactions.uncategorized')}
        onPress={() => setPicking('category')}
      />
      <PickerField label={t('transactions.repeat.frequency')} value={t(`common.frequencies.${v.frequency}`)} placeholder="" onPress={() => setPicking('frequency')} />
      <DateField label={t('recurring.startDate')} value={v.startDate} onChange={(startDate) => set({ startDate })} />
      <TextField
        label={t('recurring.dayOfMonth')}
        value={v.dayOfMonth}
        onChangeText={(dayOfMonth) => set({ dayOfMonth: dayOfMonth.replace(/\D/g, '') })}
        keyboardType="number-pad"
        maxLength={2}
        placeholder={t('recurring.dayOfMonthPlaceholder')}
      />
      {v.endDate ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <DateField label={t('transactions.repeat.endDate')} value={v.endDate} onChange={(endDate) => set({ endDate })} />
          </View>
          <Button label={t('recurring.noEnd')} variant="ghost" onPress={() => set({ endDate: null })} />
        </View>
      ) : (
        <PickerField label={t('transactions.repeat.endDate')} value={null} placeholder={t('transactions.repeat.noEnd')} onPress={() => set({ endDate: v.startDate })} />
      )}
      <Text variant="label" tone="muted">
        {t('recurring.weekend')}
      </Text>
      <SegmentedControl value={v.weekend} onChange={(weekend) => set({ weekend })} options={WEEKEND.map((value) => ({ value, label: t(`recurring.weekendOptions.${value}`) }))} />
      <SwitchField label={t('recurring.autoGenerate')} hint={t('recurring.autoGenerateHint')} value={v.autoGenerate} onChange={(autoGenerate) => set({ autoGenerate })} />
      {item ? <SwitchField label={t('recurring.active')} value={v.isActive} onChange={(isActive) => set({ isActive })} /> : null}
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={create.isPending || update.isPending} />
      {item ? <Button label={t('common.delete')} variant="ghost" onPress={confirmDelete} loading={remove.isPending} /> : null}

      <SelectSheet
        visible={picking === 'account'}
        title={t('transactions.account')}
        options={accountOptions(accounts)}
        selected={v.accountId || null}
        onSelect={(accountId) => {
          if (accountId) set({ accountId })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'category'}
        title={t('transactions.category')}
        options={categories}
        selected={v.categoryId}
        noneLabel={t('transactions.uncategorized')}
        onSelect={(categoryId) => {
          set({ categoryId })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'frequency'}
        title={t('transactions.repeat.frequency')}
        options={FREQUENCIES.map((f) => ({ value: f, label: t(`common.frequencies.${f}`) }))}
        selected={v.frequency}
        onSelect={(frequency) => {
          if (frequency) set({ frequency: frequency as Frequency })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  flex: { flex: 1 },
})
