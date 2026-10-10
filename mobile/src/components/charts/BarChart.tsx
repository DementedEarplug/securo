import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Line, Rect } from 'react-native-svg'

import { ChartAxis } from './ChartAxis'
import { useColors } from '@/theme'
import { linearScale } from './scale'

export interface BarGroup {
  label: string
  values: number[]
}

const HEIGHT = 160

/** Top and bottom of each stacked segment: positives stack up from 0, negatives down. */
export function stackGroup(values: number[]): { from: number; to: number }[] {
  let up = 0
  let down = 0
  return values.map((value) => {
    if (value >= 0) {
      const from = up
      up += value
      return { from, to: up }
    }
    const from = down
    down += value
    return { from, to: down }
  })
}

/**
 * Bars per bucket, e.g. income vs expenses by month: side by side, or
 * `stacked` into one bar. With `onPressGroup`, each bucket is a button.
 */
export function BarChart({
  groups,
  seriesColors,
  accessibilityLabel,
  stacked = false,
  onPressGroup,
  selectedIndex,
  groupAccessibilityLabel,
}: {
  groups: BarGroup[]
  seriesColors: string[]
  accessibilityLabel: string
  stacked?: boolean
  onPressGroup?: (index: number) => void
  /** Highlights one bucket (the others fade). */
  selectedIndex?: number | null
  /** Spoken label of each bucket's button (defaults to its axis label). */
  groupAccessibilityLabel?: (group: BarGroup, index: number) => string
}) {
  const colors = useColors()
  const [width, setWidth] = useState(0)
  const stacks = groups.map((g) => stackGroup(g.values))
  const domain = stacked ? stacks.flatMap((s) => s.map((seg) => seg.to)) : groups.flatMap((g) => g.values)
  const y = linearScale(domain, HEIGHT)
  const slot = groups.length ? width / groups.length : 0
  const series = stacked ? 1 : seriesColors.length
  const barWidth = Math.max(2, (slot * 0.7) / series)
  const zero = y(0)
  // Show at most ~7 axis labels so they never collide.

  return (
    <View
      accessible={!onPressGroup}
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <View>
          <Svg width={width} height={HEIGHT}>
            {groups.map((group, gi) => {
              const faded = selectedIndex != null && selectedIndex !== gi
              return group.values.map((value, si) => {
                const opacity = faded ? 0.35 : 1
                if (stacked) {
                  const seg = stacks[gi]![si]!
                  if (seg.from === seg.to) return null
                  const top = Math.min(y(seg.to), y(seg.from))
                  return (
                    <Rect
                      key={`${gi}-${si}`}
                      x={gi * slot + slot * 0.15}
                      y={top}
                      width={barWidth - 1}
                      height={Math.max(1, Math.abs(y(seg.to) - y(seg.from)))}
                      fill={seriesColors[si % seriesColors.length]}
                      opacity={opacity}
                    />
                  )
                }
                const top = Math.min(y(value), zero)
                return (
                  <Rect
                    key={`${gi}-${si}`}
                    x={gi * slot + slot * 0.15 + si * barWidth}
                    y={top}
                    width={barWidth - 1}
                    height={Math.max(1, Math.abs(zero - y(value)))}
                    rx={2}
                    fill={seriesColors[si]}
                    opacity={opacity}
                  />
                )
              })
            })}
            <Line x1={0} x2={width} y1={zero} y2={zero} stroke={colors.border} strokeWidth={1} />
          </Svg>
          {onPressGroup ? (
            <View style={styles.hits}>
              {groups.map((group, gi) => (
                <Pressable
                  key={group.label + gi}
                  accessibilityRole="button"
                  accessibilityLabel={groupAccessibilityLabel ? groupAccessibilityLabel(group, gi) : group.label}
                  onPress={() => onPressGroup(gi)}
                  style={styles.hit}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ height: HEIGHT }} />
      )}
      <ChartAxis labels={groups.map((g) => g.label)} width={width} align="centers" maxLabels={7} />
    </View>
  )
}

const styles = StyleSheet.create({
  hits: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  hit: { flex: 1 },
})
