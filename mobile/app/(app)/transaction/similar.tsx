import { useQuery } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, StyleSheet, View } from 'react-native'

import type { Transaction } from '@/api/types'
import { AmountText } from '@/components/AmountText'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Screen } from '@/components/Screen'
import { SegmentedControl } from '@/components/SegmentedControl'
import { ErrorState, Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { previewRule, useCategorizeSimilar } from '@/features/rules/hooks'
import { isUsableMatch, MIN_MATCH_LENGTH, similarCondition, vendorKey, type SimilarMatch } from '@/features/rules/similar'
import { useDisplayFormat, useWorkspaceKey } from '@/features/session/hooks'
import { useCategories, useTransaction } from '@/features/transactions/hooks'
import { formatDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { useDebounced } from '@/lib/use-debounced'
import { spacing } from '@/theme'

const SAMPLE_SIZE = 5

/**
 * Offered right after a transaction's category changes: give the vendor's
 * other transactions, and every future one, the same category.
 */
export default function SimilarTransactionsScreen() {
  const { id, categoryId } = useLocalSearchParams<{ id: string; categoryId: string }>()
  const transaction = useTransaction(id)
  const categories = useCategories()
  if (transaction.isPending || categories.isPending) return <Loading />
  if (transaction.isError) return <ErrorState error={transaction.error} onRetry={() => transaction.refetch()} />
  const category = categories.data?.find((c) => c.id === categoryId)
  if (!category) return <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
  return <Similar tx={transaction.data} categoryId={category.id} categoryName={category.name} />
}

function Similar({ tx, categoryId, categoryName }: { tx: Transaction; categoryId: string; categoryName: string }) {
  const { t } = useTranslation()
  const ws = useWorkspaceKey()
  const { dateLocale } = useDisplayFormat()
  const categorize = useCategorizeSimilar()
  const payeeName = tx.payee_name ?? null
  const [by, setBy] = useState<SimilarMatch['by']>(tx.payee_id ? 'payee' : 'description')
  // Rules see the imported text, so the vendor is read from it rather than a renamed description.
  const [text, setText] = useState(() => vendorKey(tx.original_description ?? tx.description))
  const [overwrite, setOverwrite] = useState(true)
  const matchFor = (value: string): SimilarMatch =>
    by === 'payee' && tx.payee_id ? { by: 'payee', payeeId: tx.payee_id } : { by: 'description', text: value }
  const match = matchFor(text)
  // Count matches once typing pauses, not on every keystroke.
  const debounced = matchFor(useDebounced(text))
  const usable = isUsableMatch(debounced)
  const vendor = match.by === 'payee' ? (payeeName ?? text) : text.trim()

  const preview = useQuery({
    queryKey: [ws, 'rules', 'similar-preview', similarCondition(debounced), categoryId, overwrite],
    queryFn: () =>
      previewRule({
        conditions_op: 'and',
        conditions: [similarCondition(debounced)],
        actions: [{ op: 'set_category', value: categoryId }],
        apply_to_existing: true,
        overwrite_existing_categories: overwrite,
        limit: SAMPLE_SIZE,
        offset: 0,
      }),
    enabled: usable,
  })

  const apply = async (applyToPast: boolean) => {
    try {
      const result = await categorize.mutateAsync({ match, vendor, categoryId, categoryName, applyToPast, overwrite })
      const future = t('transactions.similar.doneFuture', { vendor, category: categoryName })
      Alert.alert(
        t('transactions.similar.doneTitle'),
        applyToPast ? `${t('transactions.similar.doneUpdated', { count: result.applied_count ?? 0 })} ${future}` : future,
      )
      router.back()
    } catch (e) {
      Alert.alert(t('common.errorTitle'), errorMessage(e, t))
    }
  }

  return (
    <Screen>
      <View style={styles.intro}>
        <Text variant="heading">{t('transactions.similar.heading', { category: categoryName })}</Text>
        <Text tone="muted">{t('transactions.similar.intro')}</Text>
      </View>

      {tx.payee_id ? (
        <SegmentedControl
          options={[
            { value: 'payee', label: t('transactions.similar.byPayee') },
            { value: 'description', label: t('transactions.similar.byDescription') },
          ]}
          value={by}
          onChange={setBy}
        />
      ) : null}
      {match.by === 'payee' ? (
        <Card>
          <Text variant="label">{payeeName ?? t('transactions.payee')}</Text>
          <Text variant="caption" tone="muted">
            {t('transactions.similar.payeeHint')}
          </Text>
        </Card>
      ) : (
        <View style={styles.field}>
          <TextField
            label={t('transactions.similar.containsLabel')}
            value={text}
            onChangeText={setText}
            autoCapitalize="characters"
            autoCorrect={false}
            error={text.trim().length < MIN_MATCH_LENGTH ? t('transactions.similar.tooShort', { count: MIN_MATCH_LENGTH }) : null}
          />
          <Text variant="caption" tone="muted">
            {t('transactions.similar.containsHint', { description: tx.original_description ?? tx.description })}
          </Text>
        </View>
      )}

      <SwitchField
        label={t('transactions.similar.overwrite')}
        hint={t('transactions.similar.overwriteHint')}
        value={overwrite}
        onChange={setOverwrite}
      />

      <Card>
        {!usable ? (
          <Text tone="muted">{t('transactions.similar.tooShort', { count: MIN_MATCH_LENGTH })}</Text>
        ) : preview.isPending ? (
          <Text tone="muted">{t('transactions.similar.counting')}</Text>
        ) : preview.isError ? (
          <Text tone="destructive">{errorMessage(preview.error, t)}</Text>
        ) : (
          <>
            <Text variant="label">
              {t('transactions.similar.summary', { count: preview.data.matched, changed: preview.data.will_change })}
            </Text>
            {preview.data.sample.map((item) => (
              <View key={item.id} style={styles.sample}>
                <View style={styles.flex}>
                  <Text numberOfLines={1}>{item.description}</Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {formatDate(item.date, dateLocale)}
                    {' · '}
                    {item.will_change
                      ? `${item.current_category_name ?? t('transactions.uncategorized')} → ${item.new_category_name ?? categoryName}`
                      : (item.current_category_name ?? t('transactions.uncategorized'))}
                  </Text>
                </View>
                <AmountText variant="caption" value={item.type === 'debit' ? -Number(item.amount) : Number(item.amount)} currency={item.currency} />
              </View>
            ))}
          </>
        )}
      </Card>

      <Button
        label={t('transactions.similar.applyAll')}
        onPress={() => void apply(true)}
        loading={categorize.isPending}
        disabled={!isUsableMatch(match)}
      />
      <Button
        label={t('transactions.similar.futureOnly')}
        variant="secondary"
        onPress={() => void apply(false)}
        disabled={!isUsableMatch(match) || categorize.isPending}
      />
      <Button label={t('transactions.similar.justThis')} variant="ghost" onPress={() => router.back()} disabled={categorize.isPending} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  intro: { gap: spacing.xs },
  field: { gap: spacing.xs },
  sample: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  flex: { flex: 1 },
})
