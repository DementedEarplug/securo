import SquarePen from 'lucide-react-native/icons/square-pen'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Pressable, StyleSheet, View, type TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ErrorState, Loading } from '@/components/States'
import { ChatComposer } from '@/features/agents/ChatComposer'
import { ChatEmpty } from '@/features/agents/ChatEmpty'
import { ChatError, ChatTurn } from '@/features/agents/ChatTurn'
import { useAgent, useConversations, useMessages } from '@/features/agents/hooks'
import { countUserMessages, historyToItems, isSaved, type ChatItem } from '@/features/agents/turns'
import { useChat } from '@/features/agents/useChat'
import { useKeyboardOverlap } from '@/features/agents/useKeyboardOverlap'
import { useCanWrite } from '@/features/session/hooks'
import { spacing, useColors } from '@/theme'

/** Chat with one agent: a saved conversation (`conversationId`) or a new one. */
export default function ChatScreen() {
  const { agentId, conversationId } = useLocalSearchParams<{ agentId: string; conversationId?: string }>()
  const agent = useAgent(agentId)
  if (agent.isPending) return <Loading />
  if (agent.isError) return <ErrorState error={agent.error} onRetry={() => agent.refetch()} />
  return <Chat agentId={agentId} agentName={agent.data.name} initialConversation={conversationId ?? null} />
}

function Chat({ agentId, agentName, initialConversation }: { agentId: string; agentName: string; initialConversation: string | null }) {
  const { t } = useTranslation()
  const colors = useColors()
  const canWrite = useCanWrite()
  // A new chat gets its id from the server's first event; keep it here (not
  // only in the URL) so the history query follows it immediately.
  const [conversationId, setConversationId] = useState(initialConversation)
  const history = useMessages(conversationId)
  const title = useConversations(agentId).data?.find((c) => c.id === conversationId)?.title
  const chat = useChat({
    agentId,
    conversationId,
    onConversation: (id) => {
      setConversationId(id)
      router.setParams({ conversationId: id })
    },
  })
  const { ref: keyboardRef, overlap, onLayout } = useKeyboardOverlap()
  const input = useRef<TextInput>(null)
  const [text, setText] = useState('')

  const saved = useMemo(() => historyToItems(history.data ?? []), [history.data])
  const items = useMemo(() => {
    const list: ChatItem[] = [...saved]
    if (chat.pendingUser && !isSaved(chat.pendingUser, saved)) list.push(chat.pendingUser)
    if (chat.draft) list.push(chat.draft)
    // The list is inverted so it stays pinned to the newest message.
    return list.reverse()
  }, [saved, chat.pendingUser, chat.draft])

  const submit = () => {
    const value = text.trim()
    if (!value) return
    setText('')
    void chat.send(value, countUserMessages(saved, value))
  }

  const newChat = () => {
    chat.stop()
    router.replace({ pathname: '/agents/chat', params: { agentId } })
  }

  const loadingHistory = Boolean(conversationId) && history.isPending && !chat.streaming

  return (
    <SafeAreaView edges={['bottom']} style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: title || agentName,
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={t('agents.newConversation')} hitSlop={12} onPress={newChat}>
              <SquarePen size={22} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <View ref={keyboardRef} onLayout={onLayout} style={[styles.root, { paddingBottom: overlap }]}>
        {loadingHistory ? (
          <Loading />
        ) : history.isError ? (
          <ErrorState error={history.error} onRetry={() => history.refetch()} />
        ) : items.length === 0 ? (
          <ChatEmpty
            agentId={agentId}
            onPick={(suggestion) => {
              setText(suggestion)
              input.current?.focus()
            }}
          />
        ) : (
          <FlatList
            inverted
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ChatTurn item={item} agentName={agentName} />}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          />
        )}
        {chat.error ? <ChatError message={chat.error} onDismiss={chat.dismissError} /> : null}
        <ChatComposer
          ref={input}
          value={text}
          onChange={setText}
          onSend={submit}
          onStop={chat.stop}
          streaming={chat.streaming}
          canWrite={canWrite}
          placeholder={t('agents.chat.placeholder', { name: agentName })}
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.md },
})
