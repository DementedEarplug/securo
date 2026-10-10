import { StyleSheet, Switch, View } from 'react-native'

import { spacing, useColors } from '@/theme'
import { Text } from './Text'

export function SwitchField({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string
  hint?: string | null
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  const colors = useColors()
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text>{label}</Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.muted }}
        thumbColor={colors.card}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  text: { flex: 1, gap: 2 },
})
