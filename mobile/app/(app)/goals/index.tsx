import { router } from 'expo-router'
import Target from 'lucide-react-native/icons/target'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Card } from '@/components/Card'
import { CategoryIcon } from '@/components/CategoryIcon'
import { Fab } from '@/components/Fab'
import { ProgressBar } from '@/components/ProgressBar'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { useGoals, type Goal } from '@/features/goals/hooks'
import { useCanWrite, useDisplayFormat } from '@/features/session/hooks'
import { formatDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { spacing } from '@/theme'

export default function GoalsScreen() {
  const { t } = useTranslation()
  const { dateLocale, locale } = useDisplayFormat()
  const canWrite = useCanWrite()
  const goals = useGoals()

  if (goals.isPending) return <Loading />
  if (goals.isError) return <ErrorState error={goals.error} onRetry={() => goals.refetch()} />

  const card = (goal: Goal) => (
    <Pressable
      key={goal.id}
      accessibilityRole="button"
      disabled={!canWrite}
      onPress={() => router.push({ pathname: '/goals/form', params: { id: goal.id } })}
    >
      <Card>
        <View style={styles.header}>
          <CategoryIcon icon={goal.icon ?? 'target'} color={goal.color ?? '#3B82F6'} fallback={Target} />
          <View style={styles.flex}>
            <Text variant="heading" numberOfLines={1}>
              {goal.name}
            </Text>
            <Text variant="caption" tone="muted">
              {[
                goal.on_track ? t(`goals.onTrack.${goal.on_track}`, { defaultValue: goal.on_track }) : null,
                goal.target_date ? t('goals.by', { date: formatDate(goal.target_date, dateLocale) }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Text variant="label">{Math.round(goal.percentage ?? 0)}%</Text>
        </View>
        <ProgressBar fraction={(goal.percentage ?? 0) / 100} color={goal.color ?? undefined} />
        <View style={styles.amounts}>
          <AmountText variant="label" value={Number(goal.current_amount)} currency={goal.currency} />
          <Text variant="caption" tone="muted">
            {t('goals.of', { amount: formatCurrency(Number(goal.target_amount), goal.currency, locale) })}
          </Text>
        </View>
        {goal.monthly_contribution && goal.status === 'active' ? (
          <Text variant="caption" tone="muted">
            {t('goals.monthly', { amount: formatCurrency(Number(goal.monthly_contribution), goal.currency, locale) })}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  )

  const active = goals.data.filter((g) => g.status === 'active')
  const other = goals.data.filter((g) => g.status !== 'active')
  return (
    <View style={styles.root}>
      <Screen onRefresh={() => goals.refetch()} refreshing={goals.isRefetching}>
        {goals.data.length === 0 ? <EmptyState title={t('goals.emptyTitle')} body={t('goals.emptyBody')} /> : active.map(card)}
        {other.length ? (
          <>
            <SectionHeader title={t('goals.otherSection')} />
            {other.map(card)}
          </>
        ) : null}
        <View style={styles.fabSpace} />
      </Screen>
      {canWrite ? <Fab label={t('goals.newTitle')} onPress={() => router.push('/goals/form')} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  amounts: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  fabSpace: { height: 72 },
})
