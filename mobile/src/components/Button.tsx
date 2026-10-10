import { ActivityIndicator, Pressable, StyleSheet } from 'react-native'

import { font, radius, spacing, useColors } from '@/theme'
import { Text } from './Text'

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost'

interface Props {
  label: string
  onPress: () => void
  variant?: Variant
  disabled?: boolean
  loading?: boolean
}

export function Button({ label, onPress, variant = 'primary', disabled = false, loading = false }: Props) {
  const colors = useColors()
  const inactive = disabled || loading
  const background = {
    primary: colors.primary,
    secondary: colors.muted,
    destructive: colors.destructive,
    ghost: 'transparent',
  }[variant]
  const foreground = {
    primary: colors.primaryForeground,
    secondary: colors.foreground,
    destructive: colors.primaryForeground,
    ghost: colors.primary,
  }[variant]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Text style={[styles.label, { color: foreground }]}>{label}</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: font.md, fontWeight: '600' },
})
