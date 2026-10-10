import { Pressable, StyleSheet, View } from 'react-native'

import { spacing, useColors } from '@/theme'
import { Text } from './Text'

/** The web app's preset palette (goals, categories). */
export const PRESET_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#84CC16', '#14B8A6', '#6B7280']

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const colors = useColors()
  return (
    <View style={styles.field}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <View accessibilityRole="radiogroup" style={styles.row}>
        {PRESET_COLORS.map((color) => {
          const selected = color.toLowerCase() === value.toLowerCase()
          return (
            <Pressable
              key={color}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={color}
              onPress={() => onChange(color)}
              style={[
                styles.swatch,
                { backgroundColor: color, borderColor: selected ? colors.foreground : 'transparent' },
              ]}
            />
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
})
