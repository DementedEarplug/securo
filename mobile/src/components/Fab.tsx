import { Pressable, StyleSheet } from 'react-native'

import { spacing, useColors } from '@/theme'
import { Icon } from './Icon'

/** The floating "add" button in the bottom-right of list screens. */
export function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.fab, { backgroundColor: colors.primary }]}
    >
      <Icon name="plus" color={colors.primaryForeground} size={28} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
})
