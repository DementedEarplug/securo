import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { LineChart } from '@/components/charts/LineChart'
import { MultiSeriesChart } from '@/components/charts/MultiSeriesChart'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useDisplayFormat } from '@/features/session/hooks'
import { formatAxisMonth } from '@/lib/dates'
import { spacing } from '@/theme'
import type { PortfolioTrend } from './hooks'
import { axisUnit, portfolioSeries, sampleIndices, sampleSeries, type AssetGroup } from './model'

/** Axis labels for `yyyy-MM-dd` dates: by day over about two months or less, else by month. */
function useAxisLabels(dates: string[]): string[] {
  const { i18n } = useTranslation()
  const { dateLocale } = useDisplayFormat()
  const unit = axisUnit(dates[0], dates.at(-1))
  const dayFormat = new Intl.DateTimeFormat(dateLocale, { day: 'numeric', month: 'numeric' })
  return dates.map((date) => {
    if (unit === 'month') return formatAxisMonth(date, i18n.language)
    const [y, m, d] = date.split('-').map(Number)
    return dayFormat.format(new Date(y!, m! - 1, d!))
  })
}

/** A value-over-time series (`yyyy-MM-dd` dates) on the shared line chart. */
export function TrendChart({ series, accessibilityLabel }: { series: { date: string; value: number }[]; accessibilityLabel: string }) {
  const points = sampleSeries(series)
  const labels = useAxisLabels(points.map((p) => p.date))
  return <LineChart points={points.map((p, i) => ({ label: labels[i]!, value: p.value }))} accessibilityLabel={accessibilityLabel} />
}

/** The web's portfolio chart: by wallet or by asset, stacked areas or lines. */
export function PortfolioChart({ data, wallets }: { data: PortfolioTrend; wallets: AssetGroup[] }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'wallet' | 'asset'>('wallet')
  const [draw, setDraw] = useState<'stacked' | 'lines'>('stacked')
  const { dates, series } = portfolioSeries(data, wallets, mode, t('assets.ungrouped'))
  const keep = sampleIndices(dates.length)
  const labels = useAxisLabels(keep.map((i) => dates[i]!))
  return (
    <View style={styles.chart}>
      <View style={styles.toggles}>
        <View style={styles.flex}>
          <SegmentedControl
            options={[
              { value: 'wallet', label: t('assets.chartByWallet') },
              { value: 'asset', label: t('assets.chartByAsset') },
            ]}
            value={mode}
            onChange={setMode}
          />
        </View>
        <View style={styles.flex}>
          <SegmentedControl
            options={[
              { value: 'stacked', label: t('assets.chartStacked') },
              { value: 'lines', label: t('assets.chartLines') },
            ]}
            value={draw}
            onChange={setDraw}
          />
        </View>
      </View>
      <MultiSeriesChart
        labels={labels}
        series={series.map((s) => ({ ...s, values: keep.map((i) => s.values[i]!) }))}
        stacked={draw === 'stacked'}
        accessibilityLabel={t('assets.portfolioChart')}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  chart: { gap: spacing.sm },
  toggles: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
})
