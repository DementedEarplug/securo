import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Pressable, StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { SelectSheet } from '@/components/SelectSheet'
import { Screen } from '@/components/Screen'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { useAccounts } from '@/features/accounts/hooks'
import { AttachmentsSection } from '@/features/attachments/AttachmentsSection'
import { useCanWrite, useDisplayFormat } from '@/features/session/hooks'
import { categoryOptions } from '@/features/transactions/category-options'
import { isInstallmentSeries, offersSimilar } from '@/features/transactions/form'
import { useCategoryGroups, useDeleteTransaction, useTransaction, useUpdateTransaction } from '@/features/transactions/hooks'
import { ScopeSheet, type Scope } from '@/features/transactions/ScopeSheet'
import { signedAmount } from '@/features/transactions/TransactionRow'
import { formatDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { spacing, useColors } from '@/theme'

export default function TransactionDetailScreen() {
  const { t } = useTranslation()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { dateLocale } = useDisplayFormat()
  const canWrite = useCanWrite()
  const transaction = useTransaction(id)
  const accounts = useAccounts().data
  const remove = useDeleteTransaction(id)
  const update = useUpdateTransaction(id)
  const groups = useCategoryGroups()
  const colors = useColors()
  const [choosingScope, setChoosingScope] = useState(false)
  const [choosingCategory, setChoosingCategory] = useState(false)

  if (transaction.isPending) return <Loading />
  if (transaction.isError) return <ErrorState error={transaction.error} onRetry={() => transaction.refetch()} />
  const tx = transaction.data
  const account = accounts?.find((a) => a.id === tx.account_id)

  const runDelete = async (scope?: Scope) => {
    setChoosingScope(false)
    try {
      await remove.mutateAsync(scope)
      router.back()
    } catch (e) {
      Alert.alert(t('common.errorTitle'), errorMessage(e, t))
    }
  }

  const confirmDelete = () => {
    if (isInstallmentSeries(tx)) {
      setChoosingScope(true)
      return
    }
    Alert.alert(
      t('transactions.deleteTitle'),
      tx.transfer_pair_id ? t('transactions.deleteTransferBody') : t('transactions.deleteBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => void runDelete() },
      ],
    )
  }

  // One tap to recategorise. Installments go through the edit form, which asks which ones to change.
  const quickCategory = canWrite && !tx.transfer_pair_id && !tx.is_shared && !isInstallmentSeries(tx)

  const changeCategory = async (categoryId: string | null) => {
    setChoosingCategory(false)
    if (categoryId === (tx.category_id ?? null)) return
    try {
      await update.mutateAsync({ category_id: categoryId })
      if (offersSimilar(tx, categoryId)) router.push({ pathname: '/transaction/similar', params: { id, categoryId } })
    } catch (e) {
      Alert.alert(t('common.errorTitle'), errorMessage(e, t))
    }
  }

  const rows: [string, string | null | undefined, (() => void)?][] = [
    [t('transactions.date'), formatDate(tx.date, dateLocale)],
    [t('transactions.account'), account?.display_name || account?.name],
    [t('transactions.category'), tx.category?.name ?? t('transactions.uncategorized'), quickCategory ? () => setChoosingCategory(true) : undefined],
    [t('transactions.payee'), tx.payee_name ?? tx.payee],
    [t('transactions.status'), tx.status === 'pending' ? t('transactions.pending') : t('transactions.posted')],
    [t('transactions.notes'), tx.notes],
    [t('transactions.installment'), isInstallmentSeries(tx) ? t('transactions.installmentOf', { n: tx.installment_number, total: tx.total_installments }) : null],
    [t('transactions.transfer.title'), tx.transfer_pair_id ? t('transactions.transfer.linked') : null],
  ]

  return (
    <Screen>
      <View style={styles.hero}>
        <AmountText
          variant="title"
          value={signedAmount(tx)}
          currency={tx.currency}
          tone={tx.type === 'credit' ? 'income' : 'expense'}
        />
        <Text variant="heading">{tx.description}</Text>
        {tx.is_ignored ? (
          <Text variant="caption" tone="muted">
            {t('transactions.ignored')}
          </Text>
        ) : null}
      </View>
      <Card>
        {rows
          .filter(([, value]) => value)
          .map(([label, value, onPress]) =>
            onPress ? (
              <Pressable
                key={label}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.border }]}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${value}`}
                accessibilityHint={t('transactions.changeCategoryHint')}
              >
                <Text variant="label" tone="muted" style={styles.label}>
                  {label}
                </Text>
                <Text style={styles.value} tone="primary">
                  {value}
                </Text>
              </Pressable>
            ) : (
              <View key={label} style={styles.row}>
                <Text variant="label" tone="muted" style={styles.label}>
                  {label}
                </Text>
                <Text style={styles.value}>{value}</Text>
              </View>
            ),
          )}
      </Card>
      <AttachmentsSection transactionId={id} canWrite={canWrite} />
      {canWrite ? (
        <View style={styles.actions}>
          <Button
            label={t('common.edit')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/transaction/edit', params: { id } })}
          />
          <Button label={t('common.delete')} variant="destructive" onPress={confirmDelete} loading={remove.isPending} />
        </View>
      ) : null}
      <SelectSheet
        visible={choosingCategory}
        title={t('transactions.category')}
        options={categoryOptions(groups.data)}
        selected={tx.category_id ?? null}
        noneLabel={t('transactions.uncategorized')}
        onSelect={(categoryId) => void changeCategory(categoryId)}
        onClose={() => setChoosingCategory(false)}
      />
      <ScopeSheet visible={choosingScope} action="delete" onChoose={(scope) => void runDelete(scope)} onClose={() => setChoosingScope(false)} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs },
  label: { width: 96 },
  value: { flex: 1 },
  actions: { gap: spacing.sm },
})
