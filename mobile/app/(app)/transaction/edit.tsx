import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Transaction, TransactionUpdate } from '@/api/types'
import { Screen } from '@/components/Screen'
import { ErrorState, Loading } from '@/components/States'
import { SplitSection } from '@/features/groups/SplitSection'
import { CLEAR_SPLITS, splitError, splitFromTransaction, toSplitsInput, type SplitState } from '@/features/groups/splits'
import { useDisplayFormat } from '@/features/session/hooks'
import { formValuesFrom, isInstallmentSeries, lockedFields, offersSimilar, toUpdatePayload } from '@/features/transactions/form'
import { useTransaction, useUpdateTransaction } from '@/features/transactions/hooks'
import { ScopeSheet, type Scope } from '@/features/transactions/ScopeSheet'
import { TransactionForm } from '@/features/transactions/TransactionForm'
import { errorMessage } from '@/lib/errors'
import { parseAmountInput } from '@/lib/format'

export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const transaction = useTransaction(id)
  if (transaction.isPending) return <Loading />
  if (transaction.isError) return <ErrorState error={transaction.error} onRetry={() => transaction.refetch()} />
  return <EditTransaction tx={transaction.data} />
}

function EditTransaction({ tx }: { tx: Transaction }) {
  const { t } = useTranslation()
  const { locale } = useDisplayFormat()
  const update = useUpdateTransaction(tx.id)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<TransactionUpdate | null>(null)
  const [original] = useState<SplitState>(() => splitFromTransaction(tx, locale))
  const [split, setSplit] = useState<SplitState>(original)
  const [splitProblem, setSplitProblem] = useState<string | null>(null)
  const locked = lockedFields(tx)

  const save = async (patch: TransactionUpdate, scope?: Scope) => {
    setPending(null)
    try {
      if (Object.keys(patch).length) await update.mutateAsync(scope ? { ...patch, apply_to: scope } : patch)
      if (offersSimilar(tx, patch.category_id)) {
        // Offer to give the vendor's other and future transactions this category too.
        router.replace({ pathname: '/transaction/similar', params: { id: tx.id, categoryId: patch.category_id } })
      } else {
        router.back()
      }
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  return (
    <Screen>
      <TransactionForm
        defaultValues={formValuesFrom(tx, locale)}
        locked={locked}
        lockedNotice={tx.transfer_pair_id ? t('transactions.form.transferNotice') : null}
        submitLabel={t('common.save')}
        error={error}
        extra={tx.transfer_pair_id ? null : <SplitSection value={split} onChange={setSplit} error={splitProblem} />}
        onSubmit={async (values) => {
          setError(null)
          const patch = toUpdatePayload(values, tx, locale)
          const problem = splitError(split, parseAmountInput(values.amount, locale), locale)
          setSplitProblem(problem)
          if (problem) return
          // Send splits when they changed, or when the amount did: the server
          // recomputes the shares from the new amount only when they're sent.
          // Leaving them out keeps them as they are.
          const splitChanged = JSON.stringify(split) !== JSON.stringify(original)
          if (splitChanged || (patch.amount !== undefined && split.groupId)) {
            patch.splits = toSplitsInput(split, locale) ?? CLEAR_SPLITS
          }
          // Like the web: ask which installments to change, unless only the status changed.
          const onlyStatus = Object.keys(patch).every((key) => key === 'status')
          if (isInstallmentSeries(tx) && Object.keys(patch).length && !onlyStatus) {
            setPending(patch)
            return
          }
          await save(patch)
        }}
      />
      <ScopeSheet
        visible={pending !== null}
        action="edit"
        onChoose={(scope) => pending && void save(pending, scope)}
        onClose={() => setPending(null)}
      />
    </Screen>
  )
}
