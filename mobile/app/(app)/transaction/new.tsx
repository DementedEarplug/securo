import { addYears } from 'date-fns'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Screen } from '@/components/Screen'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Loading } from '@/components/States'
import { useAccounts } from '@/features/accounts/hooks'
import { SplitSection } from '@/features/groups/SplitSection'
import { NO_SPLIT, splitError, toSplitsInput, type SplitState } from '@/features/groups/splits'
import { useDisplayFormat } from '@/features/session/hooks'
import { emptyFormValues, toCreatePayload } from '@/features/transactions/form'
import { useCreateTransactionWithRepeat, useCreateTransfer } from '@/features/transactions/hooks'
import { NO_REPEAT, installmentCount, type Repeat } from '@/features/transactions/repeat'
import { RepeatSection } from '@/features/transactions/RepeatSection'
import { TransactionForm } from '@/features/transactions/TransactionForm'
import { TransferForm } from '@/features/transactions/TransferForm'
import { toIsoDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { parseAmountInput } from '@/lib/format'

export default function NewTransactionScreen() {
  const { t } = useTranslation()
  const { locale, currency } = useDisplayFormat()
  const { accountId } = useLocalSearchParams<{ accountId?: string }>()
  const accounts = useAccounts()
  const create = useCreateTransactionWithRepeat()
  const transfer = useCreateTransfer()
  const [mode, setMode] = useState<'transaction' | 'transfer'>('transaction')
  const [repeat, setRepeat] = useState<Repeat>(NO_REPEAT)
  const [split, setSplit] = useState<SplitState>(NO_SPLIT)
  const [splitProblem, setSplitProblem] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (accounts.isPending) return <Loading />
  const open = (accounts.data ?? []).filter((a) => !a.is_closed)
  // With a single account there is nothing to choose.
  const defaults = emptyFormValues(accountId ?? (open.length === 1 ? open[0]!.id : ''))

  return (
    <Screen>
      <SegmentedControl
        value={mode}
        onChange={(next) => {
          setMode(next)
          setError(null)
        }}
        options={[
          { value: 'transaction', label: t('transactions.newTitle') },
          { value: 'transfer', label: t('transactions.transfer.title') },
        ]}
      />
      {mode === 'transfer' ? (
        <TransferForm
          accounts={open}
          locale={locale}
          submitting={transfer.isPending}
          error={error}
          onSubmit={async (body) => {
            setError(null)
            try {
              await transfer.mutateAsync(body)
              router.back()
            } catch (e) {
              setError(errorMessage(e, t))
            }
          }}
        />
      ) : (
        <TransactionForm
          defaultValues={defaults}
          submitLabel={t('common.save')}
          error={error}
          amountLabel={repeat.kind === 'installments' ? t('transactions.repeat.amountPerInstallment') : undefined}
          extra={
            <>
              <SplitSection value={split} onChange={setSplit} error={splitProblem} />
              <RepeatSection value={repeat} onChange={setRepeat} defaultEndDate={toIsoDate(addYears(new Date(), 1))} />
            </>
          }
          onSubmit={async (values) => {
            setError(null)
            if (repeat.kind === 'installments' && installmentCount(repeat.count) === null) {
              setError(t('transactions.repeat.countInvalid'))
              return
            }
            const problem = splitError(split, parseAmountInput(values.amount, locale), locale)
            setSplitProblem(problem)
            if (problem) return
            const splits = toSplitsInput(split, locale)
            const account = open.find((a) => a.id === values.accountId)
            try {
              await create.mutateAsync({
                body: { ...toCreatePayload(values, locale), ...(splits ? { splits } : {}) },
                repeat,
                currency: account?.currency ?? currency,
              })
              router.back()
            } catch (e) {
              setError(errorMessage(e, t))
            }
          }}
        />
      )}
    </Screen>
  )
}
