import { StyleSheet } from 'react-native'

import { spacing } from '@/theme'
import { Text } from './Text'

export function SectionHeader({ title }: { title: string }) {
  return (
    <Text variant="label" tone="muted" style={styles.header} accessibilityRole="header">
      {title}
    </Text>
  )
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
})
