import Plug from 'lucide-react-native/icons/plug'
import { router, Stack } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Fab } from '@/components/Fab'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { AgentAvatar } from '@/features/agents/AgentAvatar'
import { connectorLabel } from '@/features/agents/connector'
import { useAgents, useLlmConnections } from '@/features/agents/hooks'
import type { Agent } from '@/features/agents/types'
import { useCanWrite } from '@/features/session/hooks'
import { useColors } from '@/theme'

/** The workspace's assistants. */
export default function AgentsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const canWrite = useCanWrite()
  const [showArchived, setShowArchived] = useState(false)
  const agents = useAgents({ includeArchived: showArchived })
  const connections = useLlmConnections().data

  const header = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('agents.connections.title')}
            hitSlop={12}
            onPress={() => router.push('/agents/connections')}
          >
            <Plug size={22} color={colors.primary} />
          </Pressable>
        ),
      }}
    />
  )

  if (agents.isPending) return <Loading />
  if (agents.isError) return <ErrorState error={agents.error} onRetry={() => agents.refetch()} />
  const active = agents.data.filter((a) => !a.is_archived)
  const archived = agents.data.filter((a) => a.is_archived)

  const row = (agent: Agent) => (
    <ListRow
      key={agent.id}
      leading={<AgentAvatar agent={agent} />}
      title={agent.is_default ? `${agent.name} · ${t('agents.default')}` : agent.name}
      subtitle={[
        agent.description || connectorLabel(agent, connections) || t('agents.instanceDefault'),
        t('agents.conversationCount', { count: agent.conversation_count ?? 0 }),
        t('agents.knowledge.count', { count: agent.knowledge_count ?? 0 }),
      ].join(' · ')}
      subtitleLines={2}
      onPress={() => router.push({ pathname: '/agents/[id]', params: { id: agent.id } })}
      showChevron
    />
  )

  return (
    <View style={styles.root}>
      {header}
      <Screen onRefresh={() => agents.refetch()} refreshing={agents.isRefetching}>
        {active.length === 0 && !showArchived ? (
          <>
            <EmptyState title={t('agents.emptyTitle')} body={canWrite ? t('agents.emptyBodyCreate') : t('agents.emptyBody')} />
            {canWrite ? <Button label={t('agents.form.createTitle')} onPress={() => router.push('/agents/form')} /> : null}
          </>
        ) : (
          <>
            <Text tone="muted">{t('agents.intro')}</Text>
            {active.length ? <Card style={styles.list}>{active.map(row)}</Card> : null}
          </>
        )}
        <SwitchField label={t('agents.showArchived')} value={showArchived} onChange={setShowArchived} />
        {showArchived && archived.length ? (
          <>
            <SectionHeader title={t('agents.archived')} />
            <Card style={styles.list}>{archived.map(row)}</Card>
          </>
        ) : null}
        <View style={styles.fabSpace} />
      </Screen>
      {canWrite && (active.length > 0 || showArchived) ? (
        <Fab label={t('agents.form.createTitle')} onPress={() => router.push('/agents/form')} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 0, overflow: 'hidden' },
  fabSpace: { height: 72 },
})
