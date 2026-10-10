import { forwardRef } from 'react'
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native'

import { font, radius, spacing, useColors } from '@/theme'
import { Text } from './Text'

interface Props extends TextInputProps {
  label: string
  error?: string | null
}

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, style, ...props },
  ref,
) {
  const colors = useColors()
  return (
    <View style={styles.field}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          {
            color: colors.foreground,
            backgroundColor: colors.card,
            borderColor: error ? colors.destructive : colors.border,
          },
          style,
        ]}
        {...props}
      />
      {error ? (
        <Text variant="caption" tone="destructive" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: font.md,
  },
})
