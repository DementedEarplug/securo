import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { CategoryIcon } from '@/components/CategoryIcon'
import { Fab } from '@/components/Fab'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { useAllCategories, useAllCategoryGroups } from '@/features/categories/hooks'
import { useCanWrite } from '@/features/session/hooks'
import { spacing } from '@/theme'

export default function CategoriesScreen() {
  const { t } = useTranslation()
  const canWrite = useCanWrite()
  const groups = useAllCategoryGroups()
  const categories = useAllCategories()

  if (groups.isPending || categories.isPending) return <Loading />
  if (groups.isError) return <ErrorState error={groups.error} onRetry={() => groups.refetch()} />
  if (categories.isError) return <ErrorState error={categories.error} onRetry={() => categories.refetch()} />

  const sorted = [...groups.data].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const ungrouped = categories.data.filter((c) => !c.group_id)
  const edit = (id: string) => router.push({ pathname: '/categories/form', params: { id } })

  const categoryRow = (category: (typeof categories.data)[number]) => (
    <ListRow
      key={category.id}
      title={category.name}
      leading={<CategoryIcon icon={category.icon} color={category.color} size="sm" />}
      subtitle={[
        category.is_hidden ? t('categories.hidden') : null,
        category.treat_as_transfer ? t('categories.transfer') : null,
        category.is_ignored ? t('categories.ignored') : null,
      ]
        .filter(Boolean)
        .join(' · ') || null}
      onPress={canWrite ? () => edit(category.id) : undefined}
    />
  )

  return (
    <View style={styles.root}>
      <Screen onRefresh={() => void Promise.all([groups.refetch(), categories.refetch()])} refreshing={groups.isRefetching}>
        {sorted.map((group) => {
          const items = categories.data.filter((c) => c.group_id === group.id)
          return (
            <View key={group.id} style={styles.section}>
              <Pressable
                accessibilityRole="button"
                disabled={!canWrite}
                onPress={() => router.push({ pathname: '/categories/group', params: { id: group.id } })}
                style={styles.groupHeader}
              >
                <CategoryIcon icon={group.icon} color={group.color} size="sm" />
                <Text variant="label" tone="muted" style={styles.flex}>
                  {group.name}
                  {group.is_hidden ? ` · ${t('categories.hidden')}` : ''}
                </Text>
                {canWrite ? (
                  <Text variant="caption" tone="primary">
                    {t('common.edit')}
                  </Text>
                ) : null}
              </Pressable>
              <Card style={styles.list}>
                {items.length ? items.map(categoryRow) : <ListRow title={t('categories.emptyGroup')} />}
              </Card>
            </View>
          )
        })}
        {ungrouped.length ? (
          <View style={styles.section}>
            <Text variant="label" tone="muted">
              {t('categories.ungrouped')}
            </Text>
            <Card style={styles.list}>{ungrouped.map(categoryRow)}</Card>
          </View>
        ) : null}
        {canWrite ? <Button label={t('categories.newGroup')} variant="secondary" onPress={() => router.push('/categories/group')} /> : null}
        <View style={styles.fabSpace} />
      </Screen>
      {canWrite ? <Fab label={t('categories.newTitle')} onPress={() => router.push('/categories/form')} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  section: { gap: spacing.sm },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  list: { padding: 0, overflow: 'hidden' },
  fabSpace: { height: 72 },
})
