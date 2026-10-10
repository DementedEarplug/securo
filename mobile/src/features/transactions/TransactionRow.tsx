import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'

import type { Transaction } from '@/api/types'
import { AmountText } from '@/components/AmountText'
import { ListRow } from '@/components/ListRow'
import { useDisplayFormat } from '@/features/session/hooks'
import { formatDate } from '@/lib/dates'

/** The amount the viewer is responsible for, signed by direction. */
export function signedAmount(tx: Transaction): number {
  const amount = tx.is_shared && tx.viewer_share != null ? Number(tx.viewer_share) : Number(tx.amount)
  return tx.type === 'debit' ? -Math.abs(amount) : Math.abs(amount)
}

export function TransactionRow({ tx }: { tx: Transaction }) {
  const { t } = useTranslation()
  const { dateLocale } = useDisplayFormat()
  const category = tx.category?.name ?? t('transactions.uncategorized')
  const subtitle = [formatDate(tx.date, dateLocale), category, tx.status === 'pending' ? t('transactions.pending') : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <ListRow
      title={tx.description}
      subtitle={subtitle}
      dotColor={tx.category?.color ?? null}
      onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: tx.id } })}
      trailing={
        <AmountText
          value={signedAmount(tx)}
          currency={tx.currency}
          tone={tx.is_ignored ? 'muted' : tx.type === 'credit' ? 'income' : 'expense'}
          variant="label"
        />
      }
    />
  )
}
