import EllipsisVertical from 'lucide-react-native/icons/ellipsis-vertical'
import FileText from 'lucide-react-native/icons/file-text'
import MessageSquare from 'lucide-react-native/icons/message-square'
import Wrench from 'lucide-react-native/icons/wrench'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Pressable, StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { AgentAvatar } from '@/features/agents/AgentAvatar'
import { connectorLabel } from '@/features/agents/connector'
import {
  useAgent,
  useConversations,
  useDeleteConversation,
  useLlmConnections,
  useRenameConversation,
} from '@/features/agents/hooks'
import { RenameDialog } from '@/features/agents/RenameDialog'
import type { Conversation } from '@/features/agents/types'
import { useCanWrite } from '@/features/session/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { formatRelative } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { spacing, useColors } from '@/theme'

/** One assistant: who answers, and its past conversations. */
export default function AgentScreen() {
  const { t, i18n } = useTranslation()
  const colors = useColors()
  const canWrite = useCanWrite()
  const { id } = useLocalSearchParams<{ id: string }>()
  const agent = useAgent(id)
  const conversations = useConversations(id)
  const connections = useLlmConnections()
  const rename = useRenameConversation()
  const remove = useDeleteConversation()
  const [renaming, setRenaming] = useState<Conversation | null>(null)

  if (agent.isPending) return <Loading />
  if (agent.isError) return <ErrorState error={agent.error} onRetry={() => agent.refetch()} />

  const via = connectorLabel(agent.data, connections.data)
  const untitled = t('agents.untitled')

  const confirmDelete = async (conversation: Conversation) => {
    const ok = await confirmDestructive(
      t('agents.conversation.delete'),
      t('agents.conversation.deleteConfirm', { name: conversation.title || untitled }),
    )
    if (!ok) return
    remove.mutate(conversation.id, { onError: (e) => showError(errorMessage(e, t)) })
  }

  const actions = (conversation: Conversation) =>
    Alert.alert(conversation.title || untitled, undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('agents.conversation.rename'), onPress: () => setRenaming(conversation) },
      { text: t('agents.conversation.delete'), style: 'destructive', onPress: () => void confirmDelete(conversation) },
    ])

  const openChat = (conversationId?: string) =>
    router.push({ pathname: '/agents/chat', params: conversationId ? { agentId: id, conversationId } : { agentId: id } })

  return (
    <Screen onRefresh={() => void conversations.refetch()} refreshing={conversations.isRefetching}>
      <Stack.Screen
        options={{
          title: agent.data.name,
          headerRight: canWrite
            ? () => (
                <Pressable accessibilityRole="button" hitSlop={12} onPress={() => router.push({ pathname: '/agents/form', params: { id } })}>
                  <Text tone="primary" variant="label">
                    {t('common.edit')}
                  </Text>
                </Pressable>
              )
            : undefined,
        }}
      />
      <Card style={styles.header}>
        <AgentAvatar agent={agent.data} size={40} />
        <View style={styles.flex}>
          <Text variant="heading">{agent.data.name}</Text>
          {agent.data.description ? (
            <Text variant="caption" tone="muted" numberOfLines={3}>
              {agent.data.description}
            </Text>
          ) : null}
          <Text variant="caption" tone="muted">
            {t('agents.via', { name: via ?? t('agents.instanceDefault') })}
          </Text>
        </View>
      </Card>
      {agent.data.is_archived ? (
        <Text variant="caption" tone="muted">
          {t('agents.archivedNotice')}
        </Text>
      ) : null}
      <Button label={t('agents.newConversation')} onPress={() => openChat()} />
      <Card style={styles.list}>
        <ListRow
          leading={<FileText size={18} color={colors.mutedForeground} />}
          title={t('agents.knowledge.title')}
          subtitle={t('agents.knowledge.subtitle')}
          onPress={() => router.push({ pathname: '/agents/knowledge', params: { id } })}
          showChevron
        />
        <ListRow
          leading={<Wrench size={18} color={colors.mutedForeground} />}
          title={t('agents.tools.title')}
          subtitle={t('agents.tools.subtitle')}
          onPress={() => router.push({ pathname: '/agents/tools', params: { id } })}
          showChevron
        />
      </Card>

      <SectionHeader title={t('agents.conversations')} />
      {conversations.isPending ? (
        <Loading />
      ) : conversations.isError ? (
        <ErrorState error={conversations.error} onRetry={() => conversations.refetch()} />
      ) : conversations.data.length === 0 ? (
        <Text tone="muted">{t('agents.noConversations')}</Text>
      ) : (
        <Card style={styles.list}>
          {conversations.data.map((conversation) => (
            <ListRow
              key={conversation.id}
              leading={<MessageSquare size={18} color={colors.mutedForeground} />}
              title={conversation.title || untitled}
              subtitle={formatRelative(conversation.updated_at, i18n.language)}
              onPress={() => openChat(conversation.id)}
              trailing={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('agents.conversation.actions')}
                  hitSlop={12}
                  onPress={() => actions(conversation)}
                >
                  <EllipsisVertical size={18} color={colors.mutedForeground} />
                </Pressable>
              }
            />
          ))}
        </Card>
      )}

      {renaming ? (
        <RenameDialog
          initial={renaming.title ?? ''}
          saving={rename.isPending}
          onCancel={() => setRenaming(null)}
          onSave={(title) =>
            rename.mutate(
              { id: renaming.id, title },
              { onSuccess: () => setRenaming(null), onError: (e) => showError(errorMessage(e, t)) },
            )
          }
        />
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  flex: { flex: 1, gap: 2 },
  list: { padding: 0, overflow: 'hidden' },
})
