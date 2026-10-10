import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'

import { ChartAxis } from './ChartAxis'
import { useColors } from '@/theme'
import { linearScale } from './scale'

export interface LinePoint {
  label: string
  value: number
}

const HEIGHT = 160

/** Path data for the points `from`..`to` (inclusive). */
function pathFor(coords: { x: number; y: number }[], from = 0, to = coords.length - 1): string {
  return coords
    .slice(from, to + 1)
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ')
}

/**
 * One series over time, e.g. net worth by month. With `onPressPoint`, each
 * point is a button. With `forecastFrom`, the line after that point is dashed
 * and lighter (a projection), with a marker at that point ("today").
 */
export function LineChart({
  points,
  accessibilityLabel,
  onPressPoint,
  color,
  forecastFrom,
  selectedIndex,
}: {
  points: LinePoint[]
  accessibilityLabel: string
  onPressPoint?: (index: number) => void
  color?: string
  /** Index of the last actual point; later points are drawn as a forecast. */
  forecastFrom?: number | null
  /** Highlights one point with a guide line. */
  selectedIndex?: number | null
}) {
  const colors = useColors()
  const [width, setWidth] = useState(0)
  const y = linearScale(points.map((p) => p.value), HEIGHT)
  const step = points.length > 1 ? width / (points.length - 1) : 0
  const coords = points.map((p, i) => ({ x: i * step, y: y(p.value) }))
  const stroke = color ?? colors.primary
  const split = forecastFrom != null && forecastFrom >= 0 && forecastFrom < coords.length - 1 ? forecastFrom : null
  const actual = pathFor(coords, 0, split ?? coords.length - 1)
  const forecast = split != null ? pathFor(coords, split) : null
  // The dot marks "now": the last actual point, or the end of a plain series.
  const now = coords[split ?? coords.length - 1]
  const selected = selectedIndex != null ? coords[selectedIndex] : undefined

  return (
    <View accessible={!onPressPoint} accessibilityLabel={accessibilityLabel} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && points.length > 0 ? (
        <View>
          <Svg width={width} height={HEIGHT}>
            <Line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={colors.border} strokeWidth={1} />
            {split != null && now ? (
              <Line x1={now.x} x2={now.x} y1={0} y2={HEIGHT} stroke={colors.mutedForeground} strokeWidth={1} strokeDasharray="3 3" />
            ) : null}
            {selected ? <Line x1={selected.x} x2={selected.x} y1={0} y2={HEIGHT} stroke={colors.border} strokeWidth={1.5} /> : null}
            <Path d={actual} stroke={stroke} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
            {forecast ? (
              <Path d={forecast} stroke={stroke} strokeOpacity={0.55} strokeWidth={2.5} strokeDasharray="6 4" fill="none" strokeLinejoin="round" />
            ) : null}
            {now ? <Circle cx={now.x} cy={now.y} r={4} fill={stroke} /> : null}
            {selected ? <Circle cx={selected.x} cy={selected.y} r={5} fill={colors.card} stroke={stroke} strokeWidth={2} /> : null}
          </Svg>
          {onPressPoint ? (
            <View style={styles.hits}>
              {points.map((p, i) => (
                <Pressable
                  key={p.label + i}
                  accessibilityRole="button"
                  accessibilityLabel={p.label}
                  onPress={() => onPressPoint(i)}
                  style={styles.hit}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ height: HEIGHT }} />
      )}
      <ChartAxis labels={points.map((p) => p.label)} width={width} align="edges" />
    </View>
  )
}

const styles = StyleSheet.create({
  hits: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  hit: { flex: 1 },
})
