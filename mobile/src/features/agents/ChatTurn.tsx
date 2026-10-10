import CircleAlert from 'lucide-react-native/icons/circle-alert'
import Sparkles from 'lucide-react-native/icons/sparkles'
import X from 'lucide-react-native/icons/x'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { Text } from '@/components/Text'
import { radius, spacing, useColors } from '@/theme'
import { Markdown } from './Markdown'
import { ProposalCard } from './ProposalCard'
import { proposalFromResult } from './proposals'
import { ToolChip } from './ToolChip'
import type { ChatItem } from './turns'

/** One message in the chat: the user's bubble, or the agent's tools + reply. */
export function ChatTurn({ item, agentName }: { item: ChatItem; agentName: string }) {
  const colors = useColors()
  if (item.kind === 'user') {
    return (
      <View style={[styles.user, { backgroundColor: colors.primary }]}>
        <Text style={{ color: colors.primaryForeground }} selectable>
          {item.text}
        </Text>
      </View>
    )
  }
  const cursor = item.pending ? ' ▍' : ''
  return (
    <View style={styles.assistant}>
      {item.tools.map((tool) => {
        const proposal = tool.result ? proposalFromResult(tool.name, tool.result.data) : null
        return proposal ? (
          <ProposalCard key={tool.id} toolCallId={tool.id} data={proposal} />
        ) : (
          <ToolChip key={tool.id} tool={tool} />
        )
      })}
      {item.text || item.pending ? (
        <View style={[styles.reply, { backgroundColor: colors.muted }]}>
          <View style={styles.author}>
            <Sparkles size={12} color={colors.mutedForeground} />
            <Text variant="caption" tone="muted">
              {agentName}
            </Text>
          </View>
          {item.text ? (
            <Markdown text={item.text + cursor} />
          ) : (
            <ActivityIndicator size="small" color={colors.mutedForeground} style={styles.spinner} />
          )}
        </View>
      ) : null}
      {item.error ? <ChatError message={item.error} /> : null}
    </View>
  )
}

/** A failed round, kept on screen until dismissed or the next message. */
export function ChatError({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  const { t } = useTranslation()
  const colors = useColors()
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.error, onDismiss && styles.errorBanner, { borderColor: colors.destructive, backgroundColor: colors.card }]}
    >
      <CircleAlert size={16} color={colors.destructive} />
      <Text variant="caption" tone="destructive" style={styles.flex}>
        {message}
      </Text>
      {onDismiss ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={12} onPress={onDismiss}>
          <X size={16} color={colors.destructive} />
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  user: { alignSelf: 'flex-end', maxWidth: '85%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  assistant: { gap: spacing.sm },
  reply: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  spinner: { alignSelf: 'flex-start' },
  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  errorBanner: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  flex: { flex: 1 },
})
