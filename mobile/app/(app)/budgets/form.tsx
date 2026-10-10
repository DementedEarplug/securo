import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/Button'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SelectSheet } from '@/components/SelectSheet'
import { Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useBudgets, useCreateBudget, useDeleteBudget, useUpdateBudget, type Budget } from '@/features/budgets/hooks'
import { useDisplayFormat } from '@/features/session/hooks'
import { categoryOptions } from '@/features/transactions/category-options'
import { useCategoryGroups } from '@/features/transactions/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { formatMonth } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatAmountInput, parseAmountInput } from '@/lib/format'

/** Set or change a category's budget for a month (`?month=yyyy-MM&categoryId=`). */
export default function BudgetFormScreen() {
  const { month, categoryId } = useLocalSearchParams<{ month: string; categoryId?: string }>()
  const budgets = useBudgets(month)
  if (budgets.isPending) return <Loading />
  const existing = categoryId ? budgets.data?.find((b) => b.category_id === categoryId) : undefined
  return <BudgetForm month={month} categoryId={categoryId ?? null} budget={existing} budgeted={new Set((budgets.data ?? []).map((b) => b.category_id))} />
}

function BudgetForm({ month, categoryId, budget, budgeted }: { month: string; categoryId: string | null; budget?: Budget; budgeted: Set<string> }) {
  const { t, i18n } = useTranslation()
  const { locale, currency } = useDisplayFormat()
  const categories = categoryOptions(useCategoryGroups().data)
  const create = useCreateBudget()
  const update = useUpdateBudget()
  const remove = useDeleteBudget()
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState<string | null>(categoryId)
  const [amount, setAmount] = useState(budget ? formatAmountInput(Number(budget.amount), locale) : '')
  const [recurring, setRecurring] = useState(budget?.is_recurring ?? true)
  // A recurring budget that started earlier: change it from this month on, keeping past months.
  const startedEarlier = Boolean(budget?.is_recurring && budget.month.slice(0, 7) !== month)
  const [fromThisMonth, setFromThisMonth] = useState(true)

  const submit = async () => {
    const value = parseAmountInput(amount, locale)
    if (!category) return setError(t('budgets.form.categoryRequired'))
    if (value === null || value <= 0) return setError(t('transactions.form.amountInvalid'))
    setError(null)
    try {
      if (budget) {
        await update.mutateAsync({
          id: budget.id,
          body: { amount: String(value), ...(startedEarlier && fromThisMonth ? { effective_month: `${month}-01` } : {}) },
        })
      } else {
        await create.mutateAsync({ category_id: category, amount: String(value), month: `${month}-01`, is_recurring: recurring })
      }
      router.back()
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const confirmDelete = async () => {
    if (!budget) return
    const body = budget.is_recurring ? t('budgets.form.deleteRecurringBody') : t('budgets.form.deleteBody')
    if (!(await confirmDestructive(t('budgets.form.deleteTitle'), body))) return
    try {
      await remove.mutateAsync(budget.id)
      router.back()
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  const label = categories.find((c) => c.value === category)?.label ?? null
  return (
    <Screen>
      <Stack.Screen options={{ title: budget ? t('budgets.form.editTitle') : t('budgets.form.newTitle') }} />
      <Text tone="muted">{formatMonth(month, i18n.language)}</Text>
      <PickerField
        label={t('transactions.category')}
        value={label}
        placeholder={t('budgets.form.chooseCategory')}
        onPress={() => !budget && setChoosing(true)}
      />
      <TextField label={`${t('transactions.amount')} (${currency})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
      {budget ? null : <SwitchField label={t('budgets.form.repeat')} hint={t('budgets.form.repeatHint')} value={recurring} onChange={setRecurring} />}
      {startedEarlier ? (
        <SwitchField label={t('budgets.form.fromThisMonth')} hint={t('budgets.form.fromThisMonthHint')} value={fromThisMonth} onChange={setFromThisMonth} />
      ) : null}
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={create.isPending || update.isPending} />
      {budget ? <Button label={t('common.delete')} variant="ghost" onPress={confirmDelete} loading={remove.isPending} /> : null}
      <SelectSheet
        visible={choosing}
        title={t('transactions.category')}
        options={categories.filter((c) => !budgeted.has(c.value))}
        selected={category}
        onSelect={(id) => {
          if (id) setCategory(id)
          setChoosing(false)
        }}
        onClose={() => setChoosing(false)}
      />
    </Screen>
  )
}
