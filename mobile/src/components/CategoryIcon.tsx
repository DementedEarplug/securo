import type { LucideIcon } from 'lucide-react-native'
import { StyleSheet, Text as RNText, View } from 'react-native'

import { ICON_MAP, isEmoji } from '@/lib/category-icons'
import CircleHelp from 'lucide-react-native/icons/circle-question-mark'

const SIZES = { sm: { box: 24, icon: 14 }, md: { box: 32, icon: 16 }, lg: { box: 40, icon: 20 } } as const

/** A category's icon on its colour, as the web app draws it. */
export function CategoryIcon({
  icon,
  color,
  size = 'md',
  fallback = CircleHelp,
}: {
  icon: string | null | undefined
  color: string | null | undefined
  size?: keyof typeof SIZES
  /** Drawn when the name isn't in the catalogue (goals default to a target). */
  fallback?: LucideIcon
}) {
  const { box, icon: iconSize } = SIZES[size]
  const name = icon || 'circle-help'
  const Glyph = ICON_MAP[name] ?? fallback
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.box, { width: box, height: box, borderRadius: box / 4, backgroundColor: color || '#6B7280' }]}
    >
      {isEmoji(name) ? (
        <RNText style={{ fontSize: iconSize - 2 }}>{name}</RNText>
      ) : (
        <Glyph size={iconSize} color="#FFFFFF" strokeWidth={2} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
})
