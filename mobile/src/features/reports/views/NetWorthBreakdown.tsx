import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { api, unwrap } from '@/api/client'
import type { Report } from '@/api/types'
import { AmountText } from '@/components/AmountText'
import { BarChart } from '@/components/charts/BarChart'
import { DonutChart, type DonutSlice } from '@/components/charts/DonutChart'
import { LineChart } from '@/components/charts/LineChart'
import { MultiSeriesChart } from '@/components/charts/MultiSeriesChart'
import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { PickerField } from '@/components/PickerField'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SelectSheet } from '@/components/SelectSheet'
import { Text } from '@/components/Text'
import { useAssetGroups } from '@/features/assets/hooks'
import { useDisplayFormat, useWorkspaceKey } from '@/features/session/hooks'
import { formatCurrency } from '@/lib/format'
import { spacing } from '@/theme'
import { bucketLabel } from '../buckets'
import { delta } from '../compare'
import { reportQuery, type ReportFilters, type ReportQuery } from '../filters'
import {
  baselineValue,
  breakdownGroups,
  COMPOSITION_VIEWS,
  compositionRows,
  GROUP_COLORS,
  groupTotals,
  itemColors,
  itemSeries,
  NET_WORTH_GROUPS,
  netWorthTrend,
  OTHER_COLOR,
  selectedSnapshot,
  type CompositionRow,
  type CompositionView,
} from '../networth'
import { DeltaText, Legend, NoData, QueryGate } from './shared'

type ChartMode = 'total' | 'breakdown' | 'holdings'

/** Slices drawn individually in the donut; the list below still shows every holding. */
const DONUT_SLICES = 7

/** Net worth for a range, optionally limited to some wallets (`asset_group_ids`), as the web's collection filter does. */
export function useNetWorthBreakdown(query: ReportQuery, walletIds: string[]) {
  const ws = useWorkspaceKey()
  const params = { ...query, ...(walletIds.length ? { asset_group_ids: walletIds } : {}) }
  return useQuery({
    queryKey: [ws, 'reports', 'net-worth', 'breakdown', params],
    queryFn: () => unwrap<Report>(api().GET('/api/reports/net-worth', { params: { query: params } })),
  })
}

/** Open the account or asset behind a composition row. */
function openHolding(row: CompositionRow) {
  if (row.group === 'assets') router.push({ pathname: '/assets/[id]', params: { id: row.key } })
  else router.push({ pathname: '/account/[id]', params: { id: row.key } })
}

export function NetWorthBreakdown({ filters }: { filters: ReportFilters }) {
  const { t, i18n } = useTranslation()
  const { locale } = useDisplayFormat()
  const query = reportQuery(filters)
  const wallets = useAssetGroups().data ?? []
  const [walletIds, setWalletIds] = useState<string[]>([])
  const [pickingWallets, setPickingWallets] = useState(false)
  const [mode, setMode] = useState<ChartMode>('total')
  const [view, setView] = useState<CompositionView>('netWorth')
  const [selected, setSelected] = useState<string | null>(null)
  const report = useNetWorthBreakdown(query, walletIds)

  const walletLabel = walletIds.length
    ? walletIds.length === 1
      ? (wallets.find((w) => w.id === walletIds[0])?.name ?? t('reports.netWorth.walletsSelected', { count: 1 }))
      : t('reports.netWorth.walletsSelected', { count: walletIds.length })
    : t('reports.netWorth.allWallets')

  return (
    <View style={styles.root}>
      {wallets.length ? (
        <>
          <PickerField label={t('reports.netWorth.wallets')} value={walletLabel} placeholder={walletLabel} onPress={() => setPickingWallets(true)} />
          <SelectSheet
            visible={pickingWallets}
            title={t('reports.netWorth.wallets')}
            options={wallets.map((w) => ({ value: w.id, label: w.name }))}
            selected={walletIds}
            noneLabel={t('reports.netWorth.allWallets')}
            onSelect={(id) => {
              if (id === null) return setWalletIds([])
              setWalletIds((ids) => (ids.includes(id) ? ids.filter((w) => w !== id) : [...ids, id]))
            }}
            onClose={() => setPickingWallets(false)}
          />
          {walletIds.length && !filters.accountIds.length ? (
            <Text variant="caption" tone="muted">
              {t('reports.netWorth.walletsOnlyHint')}
            </Text>
          ) : null}
        </>
      ) : null}
      <QueryGate queries={[report]}>
        {() => {
          const data = report.data!
          const currency = data.meta.currency
          const trend = netWorthTrend(data)
          if (!trend.length) return <NoData />
          const interval = query.interval
          const label = (date: string) => bucketLabel(date, interval, i18n.language)
          const { point, index, isLatest } = selectedSnapshot(trend, selected)
          const totals = groupTotals(point!)
          const change = delta(totals.net, baselineValue(data))
          // Colours come from the end of the range so a holding keeps its colour on earlier dates.
          const colors = itemColors(trend.at(-1)?.composition ?? [])
          const rows = compositionRows(point!.composition ?? [], view, colors)
          const rowsTotal = rows.reduce((sum, row) => sum + row.value, 0)
          const select = (i: number) => setSelected(i === trend.length - 1 ? null : trend[i]!.date)

          return (
            <>
              <Card>
                <Text variant="label" tone="muted">
                  {isLatest ? t('reports.netWorth.title') : t('reports.netWorth.on', { date: label(point!.date) })}
                </Text>
                <AmountText variant="title" value={totals.net} currency={currency} tone={totals.net < 0 ? 'expense' : 'default'} />
                <View style={styles.changeRow}>
                  <DeltaText value={change} currency={currency} goodWhenUp />
                  <Text variant="caption" tone="muted">
                    {t('reports.netWorth.sinceStart')}
                  </Text>
                </View>
                <View style={styles.totals}>
                  {NET_WORTH_GROUPS.map((group) => (
                    <View key={group} style={styles.total}>
                      <View style={styles.totalLabel}>
                        <View style={[styles.swatch, { backgroundColor: GROUP_COLORS[group] }]} />
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {t(`reports.netWorth.groups.${group}`)}
                        </Text>
                      </View>
                      <AmountText
                        variant="label"
                        value={group === 'liabilities' ? -totals.liabilities : totals[group]}
                        currency={currency}
                        tone={group === 'liabilities' && totals.liabilities > 0 ? 'expense' : 'default'}
                      />
                    </View>
                  ))}
                </View>
              </Card>

              <Card style={styles.chartCard}>
                <SegmentedControl
                  options={[
                    { value: 'total', label: t('reports.netWorth.modes.total') },
                    { value: 'breakdown', label: t('reports.netWorth.modes.breakdown') },
                    { value: 'holdings', label: t('reports.netWorth.modes.holdings') },
                  ]}
                  value={mode}
                  onChange={setMode}
                />
                {mode === 'total' ? (
                  <LineChart
                    points={trend.map((p) => ({ label: label(p.date), value: p.value }))}
                    onPressPoint={select}
                    accessibilityLabel={t('reports.netWorth.chartA11y', {
                      amount: formatCurrency(totals.net, currency, locale),
                    })}
                  />
                ) : mode === 'breakdown' ? (
                  <>
                    <BarChart
                      stacked
                      groups={breakdownGroups(trend, label)}
                      seriesColors={NET_WORTH_GROUPS.map((g) => GROUP_COLORS[g])}
                      onPressGroup={select}
                      selectedIndex={isLatest ? null : index}
                      groupAccessibilityLabel={(group, i) => {
                        const at = groupTotals(trend[i]!)
                        return t('reports.netWorth.barA11y', {
                          date: group.label,
                          net: formatCurrency(at.net, currency, locale),
                          owned: formatCurrency(at.accounts + at.assets, currency, locale),
                          owed: formatCurrency(at.liabilities, currency, locale),
                        })
                      }}
                      accessibilityLabel={t('reports.netWorth.breakdownA11y')}
                    />
                    <Legend items={NET_WORTH_GROUPS.map((g) => ({ key: g, label: t(`reports.netWorth.groups.${g}`), color: GROUP_COLORS[g] }))} />
                  </>
                ) : (
                  <MultiSeriesChart
                    labels={trend.map((p) => label(p.date))}
                    series={itemSeries(trend, colors, { otherLabel: t('reports.other') })}
                    stacked={false}
                    accessibilityLabel={t('reports.netWorth.holdingsA11y')}
                  />
                )}
                <Text variant="caption" tone="muted">
                  {mode === 'holdings' ? t('reports.netWorth.holdingsHint') : t('reports.netWorth.tapHint')}
                </Text>
              </Card>

              <Card style={styles.chartCard}>
                <Text variant="label">
                  {isLatest ? t('reports.netWorth.composition') : t('reports.netWorth.compositionOn', { date: label(point!.date) })}
                </Text>
                <SegmentedControl
                  options={COMPOSITION_VIEWS.map((v) => ({ value: v, label: t(`reports.netWorth.views.${v}`) }))}
                  value={view}
                  onChange={setView}
                />
                {rows.length ? (
                  <DonutChart
                    slices={donutSlices(rows, t('reports.other'))}
                    centerValue={formatCurrency(view === 'netWorth' ? totals.net : rowsTotal, currency, locale)}
                    centerLabel={t(`reports.netWorth.views.${view}`)}
                    onPressSlice={(key) => {
                      const row = rows.find((r) => r.key === key)
                      if (row) openHolding(row)
                    }}
                    accessibilityLabel={t('reports.netWorth.compositionA11y', {
                      top: rows
                        .slice(0, 3)
                        .map((r) => `${r.label} ${Math.round(r.share * 100)}%`)
                        .join(', '),
                    })}
                  />
                ) : (
                  <Text tone="muted">{t('reports.netWorth.nothingHere')}</Text>
                )}
              </Card>

              {rows.length ? (
                <Card style={styles.list}>
                  {rows.map((row) => (
                    <ListRow
                      key={row.key}
                      title={row.label}
                      subtitle={`${t(`reports.netWorth.groups.${row.group}`)} · ${(row.share * 100).toFixed(1)}%`}
                      leading={<View style={[styles.dot, { backgroundColor: row.color }]} />}
                      trailing={
                        <AmountText
                          variant="label"
                          value={row.group === 'liabilities' ? -row.value : row.value}
                          currency={currency}
                          tone={row.group === 'liabilities' ? 'expense' : 'default'}
                        />
                      }
                      onPress={() => openHolding(row)}
                      showChevron
                    />
                  ))}
                </Card>
              ) : null}
            </>
          )
        }}
      </QueryGate>
    </View>
  )
}

/** The biggest holdings as slices, the rest as one "Other" slice. */
function donutSlices(rows: CompositionRow[], otherLabel: string): DonutSlice[] {
  const byValue = [...rows].sort((a, b) => b.value - a.value)
  const slices: DonutSlice[] = byValue.slice(0, DONUT_SLICES).map(({ key, label, value, color }) => ({ key, label, value, color }))
  const rest = byValue.slice(DONUT_SLICES)
  if (rest.length) slices.push({ key: '__rest', label: otherLabel, color: OTHER_COLOR, value: rest.reduce((sum, r) => sum + r.value, 0) })
  return slices
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  changeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  totals: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  total: { flex: 1, gap: 2 },
  totalLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  chartCard: { gap: spacing.md },
  list: { padding: 0, overflow: 'hidden' },
  dot: { width: 12, height: 12, borderRadius: 6 },
})
