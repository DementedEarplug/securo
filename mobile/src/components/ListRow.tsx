import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { spacing, useColors } from '@/theme'
import { Icon } from './Icon'
import { Text } from './Text'

interface Props {
  title: string
  subtitle?: string | null
  /** Right-hand content, e.g. an amount. */
  trailing?: ReactNode
  /** Small coloured dot before the title (category or account colour). */
  dotColor?: string | null
  /** Anything before the title, e.g. a category icon. */
  leading?: ReactNode
  onPress?: () => void
  accessibilityLabel?: string
  showChevron?: boolean
  /** Lines of subtitle before it is truncated. */
  subtitleLines?: number
}

export function ListRow({
  title,
  subtitle,
  trailing,
  dotColor,
  leading,
  onPress,
  accessibilityLabel,
  showChevron,
  subtitleLines = 1,
}: Props) {
  const colors = useColors()
  const content = (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      {leading}
      {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
      <View style={styles.text}>
        <Text numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {showChevron ? <Icon name="chevron-right" color={colors.mutedForeground} size={18} /> : null}
    </View>
  )
  if (!onPress) return content
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      android_ripple={{ color: colors.muted }}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { flex: 1, gap: 2 },
})
