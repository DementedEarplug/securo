import { StyleSheet, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'

import { Text } from '@/components/Text'
import { useColors } from '@/theme'
import { donutArcs } from './donut'

export interface DonutSlice {
  key: string
  label: string
  value: number
  color: string
}

/**
 * Shares of a whole as a ring, with a label in the hole. Tapping a slice
 * calls `onPressSlice`; the selected slice stays solid while the rest fade.
 */
export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  onPressSlice,
  selectedKey,
  size = 200,
  accessibilityLabel,
}: {
  slices: DonutSlice[]
  centerLabel?: string
  centerValue?: string
  onPressSlice?: (key: string) => void
  selectedKey?: string | null
  size?: number
  accessibilityLabel: string
}) {
  const colors = useColors()
  const r = size / 2
  const geometry = { cx: r, cy: r, r: r - 2, inner: r * 0.62 }
  const arcs = donutArcs(
    slices.map((s) => s.value),
    geometry,
  )

  return (
    <View accessible accessibilityLabel={accessibilityLabel} style={[styles.root, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {arcs.length === 0 ? (
          <Circle cx={r} cy={r} r={(geometry.r + geometry.inner) / 2} stroke={colors.muted} strokeWidth={geometry.r - geometry.inner} fill="none" />
        ) : (
          arcs.map((arc) => {
            const slice = slices[arc.index]!
            const dimmed = selectedKey != null && selectedKey !== slice.key
            return (
              <Path
                key={slice.key}
                d={arc.path}
                fill={slice.color}
                opacity={dimmed ? 0.3 : 1}
                stroke={colors.card}
                strokeWidth={arcs.length > 1 ? 1.5 : 0}
                onPress={onPressSlice ? () => onPressSlice(slice.key) : undefined}
              />
            )
          })
        )}
      </Svg>
      <View pointerEvents="none" style={styles.center}>
        {centerValue ? (
          <Text variant="heading" numberOfLines={1} adjustsFontSizeToFit style={styles.centerText}>
            {centerValue}
          </Text>
        ) : null}
        {centerLabel ? (
          <Text variant="caption" tone="muted" numberOfLines={2} style={styles.centerText}>
            {centerLabel}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { alignSelf: 'center' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: '22%' },
  centerText: { textAlign: 'center' },
})
