import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text as RNText, View } from 'react-native'

import { BarChart } from '@/components/charts/BarChart'
import { LineChart } from '@/components/charts/LineChart'
import { Text } from '@/components/Text'
import { useDisplayFormat } from '@/features/session/hooks'
import { formatCurrency } from '@/lib/format'
import { font, radius, spacing, useColors } from '@/theme'
import { parseChart } from './chart'

/** A ```securo-chart block from an assistant reply; raw JSON if it can't be drawn. */
export function ChartBlock({ raw }: { raw: string }) {
  const { t } = useTranslation()
  const colors = useColors()
  const { locale } = useDisplayFormat()
  const chart = useMemo(() => parseChart(raw), [raw])

  if (!chart) {
    return (
      <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.muted }]}>
        <RNText style={[styles.code, { color: colors.foreground }]}>{raw}</RNText>
      </View>
    )
  }

  const format = (value: number) =>
    chart.currency ? formatCurrency(value, chart.currency, locale) : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  const label = chart.title ?? t('agents.chart.label')
  const empty = chart.type === 'pie' ? chart.slices.length === 0 : chart.labels.length === 0

  return (
    <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
      {chart.title ? <Text variant="label">{chart.title}</Text> : null}
      {chart.subtitle ? (
        <Text variant="caption" tone="muted">
          {chart.subtitle}
        </Text>
      ) : null}
      {empty ? (
        <Text variant="caption" tone="muted" style={styles.center}>
          {t('agents.chart.noData')}
        </Text>
      ) : chart.type === 'pie' ? (
        <PieList slices={chart.slices} format={format} />
      ) : chart.series.length === 1 && chart.type !== 'bar' ? (
        <LineChart
          accessibilityLabel={label}
          points={chart.labels.map((x, i) => ({ label: x, value: chart.series[0]!.values[i] ?? 0 }))}
        />
      ) : (
        <BarChart
          accessibilityLabel={label}
          seriesColors={chart.series.map((s) => s.color)}
          groups={chart.labels.map((x, i) => ({ label: x, values: chart.series.map((s) => s.values[i] ?? 0) }))}
        />
      )}
      {chart.type !== 'pie' && chart.series.length > 1 ? (
        <View style={styles.legend}>
          {chart.series.map((s) => (
            <View key={s.key} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <Text variant="caption" tone="muted">
                {s.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function PieList({ slices, format }: { slices: { name: string; value: number; color: string }[]; format: (v: number) => string }) {
  const colors = useColors()
  const total = slices.reduce((sum, s) => sum + Math.abs(s.value), 0)
  return (
    <View style={styles.pie}>
      {slices.map((slice, i) => {
        const share = total ? Math.abs(slice.value) / total : 0
        return (
          <View key={`${slice.name}-${i}`} style={styles.slice}>
            <View style={styles.sliceHeader}>
              <View style={[styles.swatch, { backgroundColor: slice.color }]} />
              <Text variant="caption" style={styles.flex} numberOfLines={1}>
                {slice.name}
              </Text>
              <Text variant="caption" tone="muted">
                {`${format(slice.value)} · ${Math.round(share * 100)}%`}
              </Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.muted }]}>
              <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: slice.color }]} />
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  code: { fontFamily: 'monospace', fontSize: font.xs },
  center: { textAlign: 'center', paddingVertical: spacing.md },
  flex: { flex: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  pie: { gap: spacing.sm },
  slice: { gap: 4 },
  sliceHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  track: { height: 6, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: '100%' },
})
