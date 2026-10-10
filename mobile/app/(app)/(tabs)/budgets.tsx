import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Card } from '@/components/Card'
import { Fab } from '@/components/Fab'
import { Icon } from '@/components/Icon'
import { ProgressBar } from '@/components/ProgressBar'
import { Screen } from '@/components/Screen'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { useBudgetComparison } from '@/features/budgets/hooks'
import { summarizeBudgets, usedFraction } from '@/features/budgets/summary'
import { formatMonth, shiftMonth, toMonth } from '@/lib/dates'
import { useCanWrite } from '@/features/session/hooks'
import { spacing, useColors } from '@/theme'

export default function BudgetsScreen() {
  const { t, i18n } = useTranslation()
  const colors = useColors()
  const [month, setMonth] = useState(() => toMonth(new Date()))
  const comparison = useBudgetComparison(month)
  const canWrite = useCanWrite()
  const edit = (categoryId?: string) =>
    router.push({ pathname: '/budgets/form', params: categoryId ? { month, categoryId } : { month } })

  const monthNav = (
    <View style={styles.monthNav}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('budgets.previousMonth')} onPress={() => setMonth(shiftMonth(month, -1))} hitSlop={12}>
        <Icon name="chevron-left" color={colors.foreground} />
      </Pressable>
      <Text variant="heading">
        {formatMonth(month, i18n.language)}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('budgets.nextMonth')} onPress={() => setMonth(shiftMonth(month, 1))} hitSlop={12}>
        <Icon name="chevron-right" color={colors.foreground} />
      </Pressable>
    </View>
  )

  if (comparison.isPending) return <Screen>{monthNav}<Loading /></Screen>
  if (comparison.isError) return <ErrorState error={comparison.error} onRetry={() => comparison.refetch()} />

  const summary = summarizeBudgets(comparison.data)
  return (
    <View style={styles.root}>
      <Screen onRefresh={() => comparison.refetch()} refreshing={comparison.isRefetching}>
        {monthNav}
        {summary.sections.length === 0 ? (
          <EmptyState title={t('budgets.emptyTitle')} body={t('budgets.emptyBody')} />
        ) : (
          <>
            <Card>
              <Text variant="label" tone="muted">
                {t('budgets.spentOfBudget')}
              </Text>
              <View style={styles.totals}>
                <AmountText variant="title" value={summary.spent} />
                <AmountText tone="muted" value={summary.budgeted} />
              </View>
              <ProgressBar fraction={summary.budgeted > 0 ? summary.spent / summary.budgeted : 0} />
              {summary.unbudgeted > 0 ? (
                <View style={styles.totals}>
                  <Text variant="caption" tone="muted">
                    {t('budgets.unbudgeted')}
                  </Text>
                  <AmountText variant="caption" tone="muted" value={summary.unbudgeted} />
                </View>
              ) : null}
            </Card>
            {summary.sections.map((section) => (
              <View key={section.title ?? 'none'} style={styles.section}>
                {section.title ? (
                  <Text variant="label" tone="muted">
                    {section.title}
                  </Text>
                ) : null}
                <Card>
                  {section.items.map((item) => (
                    <Pressable
                      key={item.category_id}
                      accessibilityRole="button"
                      disabled={!canWrite}
                      onPress={() => edit(item.category_id)}
                      style={styles.item}
                    >
                      <View style={styles.itemHeader}>
                        <View style={[styles.dot, { backgroundColor: item.category_color }]} />
                        <Text style={styles.itemName} numberOfLines={1}>
                          {item.category_name}
                        </Text>
                        <AmountText variant="label" value={Math.abs(Number(item.actual_amount))} />
                        <Text variant="caption" tone="muted">
                          {' / '}
                        </Text>
                        <AmountText variant="caption" tone="muted" value={Number(item.budget_amount)} />
                      </View>
                      <ProgressBar fraction={usedFraction(item)} color={item.category_color} />
                    </Pressable>
                  ))}
                </Card>
              </View>
            ))}
          </>
        )}
        <View style={styles.fabSpace} />
      </Screen>
      {canWrite ? <Fab label={t('budgets.form.newTitle')} onPress={() => edit()} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fabSpace: { height: 72 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totals: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  section: { gap: spacing.sm },
  item: { gap: spacing.xs, paddingVertical: spacing.xs },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  itemName: { flex: 1 },
})
