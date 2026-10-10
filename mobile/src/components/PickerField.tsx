import { Pressable, StyleSheet, View } from 'react-native'

import { radius, spacing, useColors } from '@/theme'
import { Icon } from './Icon'
import { Text } from './Text'

/** A form field that opens a picker: shows the label, the chosen value, and an error. */
export function PickerField({
  label,
  value,
  placeholder,
  onPress,
  error,
}: {
  label: string
  value: string | null
  placeholder: string
  onPress: () => void
  error?: string | null
}) {
  const colors = useColors()
  return (
    <View style={styles.field}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        onPress={onPress}
        style={[styles.box, { backgroundColor: colors.card, borderColor: error ? colors.destructive : colors.border }]}
      >
        <Text tone={value ? 'default' : 'muted'} numberOfLines={1} style={styles.value}>
          {value ?? placeholder}
        </Text>
        <Icon name="chevron-right" color={colors.mutedForeground} size={18} />
      </Pressable>
      {error ? (
        <Text variant="caption" tone="destructive">
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  box: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  value: { flex: 1 },
})
