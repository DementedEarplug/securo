import { StyleSheet, View } from 'react-native'

import { radius, useColors } from '@/theme'

/** A 0–1+ fraction; over budget fills red. */
export function ProgressBar({ fraction, color }: { fraction: number; color?: string }) {
  const colors = useColors()
  const clamped = Math.max(0, Math.min(1, fraction))
  const fill = fraction > 1 ? colors.expense : fraction > 0.85 ? colors.warning : (color ?? colors.primary)
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      style={[styles.track, { backgroundColor: colors.muted }]}
    >
      <View style={[styles.fill, { width: `${clamped * 100}%`, backgroundColor: fill }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full },
})
