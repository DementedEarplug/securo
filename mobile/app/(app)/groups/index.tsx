import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Card } from '@/components/Card'
import { Fab } from '@/components/Fab'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { useGroups } from '@/features/groups/hooks'
import { useCanWrite } from '@/features/session/hooks'

export default function GroupsScreen() {
  const { t } = useTranslation()
  const canWrite = useCanWrite()
  const groups = useGroups()

  if (groups.isPending) return <Loading />
  if (groups.isError) return <ErrorState error={groups.error} onRetry={() => groups.refetch()} />

  return (
    <View style={styles.root}>
      <Screen onRefresh={() => groups.refetch()} refreshing={groups.isRefetching}>
        {groups.data.length === 0 ? (
          <EmptyState title={t('groups.emptyTitle')} body={t('groups.emptyBody')} />
        ) : (
          <Card style={styles.list}>
            {groups.data.map((group) => (
              <ListRow
                key={group.id}
                title={group.name}
                dotColor={group.color}
                subtitle={[
                  t(`groups.kinds.${group.kind}`, { defaultValue: group.kind }),
                  t('groups.memberCount', { count: group.members?.length ?? 0 }),
                  group.is_archived ? t('groups.archived') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => router.push({ pathname: '/groups/[id]', params: { id: group.id } })}
                showChevron
              />
            ))}
          </Card>
        )}
        <View style={styles.fabSpace} />
      </Screen>
      {canWrite ? <Fab label={t('groups.newTitle')} onPress={() => router.push('/groups/form')} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 0, overflow: 'hidden' },
  fabSpace: { height: 72 },
})
