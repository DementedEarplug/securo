import { Pressable, StyleSheet, View } from 'react-native'

import { radius, spacing, useColors } from '@/theme'
import { Text } from './Text'

interface Option<T extends string> {
  value: T
  label: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[]
  value: T | null
  onChange: (value: T) => void
}) {
  const colors = useColors()
  return (
    <View accessibilityRole="radiogroup" style={[styles.track, { backgroundColor: colors.muted }]}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && { backgroundColor: colors.card }]}
          >
            {/* Shrink rather than break a word across lines on narrow phones. */}
            <Text variant="label" tone={selected ? 'default' : 'muted'} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: spacing.sm },
})
