import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { session } from '@/auth/session'
import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { useCurrentWorkspace, useWorkspaces } from '@/features/session/hooks'

export default function WorkspacesScreen() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const workspaces = useWorkspaces()
  const current = useCurrentWorkspace()

  if (workspaces.isPending) return <Loading />
  if (workspaces.isError) return <ErrorState error={workspaces.error} onRetry={() => workspaces.refetch()} />

  const choose = async (id: string) => {
    await session.setWorkspaceId(id)
    // Keys are workspace-scoped, but drop the old workspace's data from memory.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' && query.queryKey[0] !== 'workspaces' })
    router.back()
  }

  return (
    <Screen>
      <Card style={styles.list}>
        {workspaces.data
          .filter((workspace) => !workspace.is_archived)
          .map((workspace) => (
            <ListRow
              key={workspace.id}
              title={workspace.name}
              subtitle={[workspace.default_currency, workspace.role ? t(`roles.${workspace.role}`, { defaultValue: workspace.role }) : null]
                .filter(Boolean)
                .join(' · ')}
              dotColor={workspace.color ?? null}
              onPress={() => choose(workspace.id)}
              trailing={workspace.id === current?.id ? <Text tone="primary">✓</Text> : null}
            />
          ))}
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden' },
})
