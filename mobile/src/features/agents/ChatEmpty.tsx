import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { Text } from '@/components/Text'
import { radius, spacing, useColors } from '@/theme'
import { AgentAvatar } from './AgentAvatar'
import { connectorLabel } from './connector'
import { useAgent, useLlmConnections } from './hooks'
import { pickSuggestions } from './turns'

/** A fresh conversation: who answers and a few things to ask. */
export function ChatEmpty({ agentId, onPick }: { agentId: string; onPick: (text: string) => void }) {
  const { t } = useTranslation()
  const colors = useColors()
  const agent = useAgent(agentId).data
  const connections = useLlmConnections().data
  const suggestions = useMemo(() => {
    const pool = t('agents.suggestions', { returnObjects: true })
    return pickSuggestions(Array.isArray(pool) ? (pool as string[]) : [], agentId)
  }, [t, agentId])
  if (!agent) return <View style={styles.flex} />
  const via = connectorLabel(agent, connections)

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <AgentAvatar agent={agent} size={56} />
      <Text variant="heading">{agent.name}</Text>
      {agent.description ? (
        <Text variant="caption" tone="muted" style={styles.center} numberOfLines={3}>
          {agent.description}
        </Text>
      ) : null}
      {via ? (
        <Text variant="caption" tone="muted">
          {t('agents.via', { name: via })}
        </Text>
      ) : null}
      {suggestions.length ? (
        <View style={styles.suggestions}>
          <Text variant="caption" tone="muted" style={styles.center}>
            {t('agents.tryAsking')}
          </Text>
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion}
              accessibilityRole="button"
              onPress={() => onPick(suggestion)}
              style={[styles.suggestion, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              <Text variant="label">{suggestion}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  center: { textAlign: 'center' },
  suggestions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg },
  suggestion: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
})
