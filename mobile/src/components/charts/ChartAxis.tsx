import { StyleSheet, View } from 'react-native'

import { spacing } from '@/theme'
import { Text } from '../Text'

const TICK_WIDTH = 64
const GAP = 4

export interface AxisTick {
  index: number
  /** Left edge of the label box, kept inside the chart. */
  left: number
}

/**
 * Which labels to show and where, so they never overlap however many points
 * there are (a daily range has hundreds). `edges`: points run from the left
 * edge to the right edge (line charts); `centers`: each point sits in the
 * middle of its slot (bar charts).
 */
export function axisTicks(count: number, width: number, align: 'edges' | 'centers', maxLabels = 6): AxisTick[] {
  if (count <= 0 || width <= 0) return []
  const fit = Math.max(1, Math.min(maxLabels, Math.floor(width / TICK_WIDTH)))
  const every = Math.max(1, Math.ceil(count / fit))
  const x = (i: number) =>
    align === 'centers' ? ((i + 0.5) * width) / count : count > 1 ? (i * width) / (count - 1) : width / 2
  const ticks: AxisTick[] = []
  for (let i = 0; i < count; i += every) {
    const left = Math.min(Math.max(x(i) - TICK_WIDTH / 2, 0), width - TICK_WIDTH)
    // Keeping the first and last labels inside the chart shifts them inwards;
    // skip a label that would then touch the one before it.
    const previous = ticks[ticks.length - 1]
    if (previous && left < previous.left + TICK_WIDTH + GAP) continue
    ticks.push({ index: i, left })
  }
  return ticks
}

/** The labels under a chart, placed under their points (see `axisTicks`). */
export function ChartAxis({
  labels,
  width,
  align,
  maxLabels,
}: {
  labels: string[]
  width: number
  align: 'edges' | 'centers'
  maxLabels?: number
}) {
  return (
    <View style={styles.axis} importantForAccessibility="no-hide-descendants">
      {axisTicks(labels.length, width, align, maxLabels).map(({ index, left }) => (
        <Text key={index} variant="caption" tone="muted" numberOfLines={1} style={[styles.tick, { left }]}>
          {labels[index]}
        </Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  axis: { height: 18, marginTop: spacing.xs },
  tick: { position: 'absolute', width: TICK_WIDTH, textAlign: 'center' },
})
