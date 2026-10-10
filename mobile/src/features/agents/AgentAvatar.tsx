import { StyleSheet, Text as RNText, View } from 'react-native'

import type { Agent } from './types'

/** The agent's initial on its colour, as the web shows it. */
export function AgentAvatar({ agent, size = 32 }: { agent: Pick<Agent, 'name' | 'color'>; size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.box, { width: size, height: size, borderRadius: size / 4, backgroundColor: agent.color || '#6366F1' }]}
    >
      <RNText style={[styles.letter, { fontSize: size / 2.2 }]}>{agent.name.trim().charAt(0).toUpperCase() || '?'}</RNText>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  letter: { color: '#FFFFFF', fontWeight: '600' },
})
