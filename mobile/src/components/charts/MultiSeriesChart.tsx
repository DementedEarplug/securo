import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Line, Path } from 'react-native-svg'

import { Text } from '@/components/Text'
import { ChartAxis } from './ChartAxis'
import { spacing, useColors } from '@/theme'
import { linearScale } from './scale'

export interface ChartSeries {
  key: string
  name: string
  color: string
  /** One value per label. */
  values: number[]
}

const HEIGHT = 180

/** Running totals per point: `stacks[s][i]` is the top of series `s` at point `i`. */
export function stackSeries(series: ChartSeries[]): number[][] {
  const stacks: number[][] = []
  series.forEach((s, si) => {
    stacks.push(s.values.map((value, i) => (si === 0 ? 0 : stacks[si - 1]![i]!) + value))
  })
  return stacks
}

/**
 * Several series over the same buckets, stacked as areas (their sum is the
 * top edge) or drawn as separate lines, with a colour legend.
 */
export function MultiSeriesChart({
  labels,
  series,
  stacked,
  accessibilityLabel,
}: {
  labels: string[]
  series: ChartSeries[]
  stacked: boolean
  accessibilityLabel: string
}) {
  const colors = useColors()
  const [width, setWidth] = useState(0)
  const tops = stacked ? stackSeries(series) : series.map((s) => s.values)
  const y = linearScale(tops.flat(), HEIGHT)
  const step = labels.length > 1 ? width / (labels.length - 1) : 0
  const x = (i: number) => i * step
  const line = (values: number[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  // Show at most ~6 axis labels so they never collide.

  return (
    <View accessible accessibilityLabel={accessibilityLabel}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && labels.length > 1 ? (
          <Svg width={width} height={HEIGHT}>
            <Line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={colors.border} strokeWidth={1} />
            {series.map((s, si) => {
              const top = tops[si]!
              if (!stacked) return <Path key={s.key} d={line(top)} stroke={s.color} strokeWidth={2} fill="none" strokeLinejoin="round" />
              const base = si === 0 ? top.map(() => 0) : tops[si - 1]!
              const back = base.map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).reverse().join(' ')
              return (
                <Path
                  key={s.key}
                  d={`${line(top)} ${back} Z`}
                  fill={s.color}
                  fillOpacity={0.35}
                  stroke={s.color}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
              )
            })}
          </Svg>
        ) : (
          <View style={{ height: HEIGHT }} />
        )}
      </View>
      <ChartAxis labels={labels} width={width} align="edges" />
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {s.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '48%' },
  swatch: { width: 10, height: 10, borderRadius: 3 },
})
