import type { Report } from '@/api/types'
import type { BarGroup } from '@/components/charts/BarChart'
import type { ChartSeries } from '@/components/charts/MultiSeriesChart'

/** The three parts of net worth the server reports (`summary.breakdowns`, `trend[].breakdowns`). */
export const NET_WORTH_GROUPS = ['accounts', 'assets', 'liabilities'] as const
export type NetWorthGroup = (typeof NET_WORTH_GROUPS)[number]

/** Same colours as the server's breakdowns and the web chart. */
export const GROUP_COLORS: Record<NetWorthGroup, string> = {
  accounts: '#6366F1',
  assets: '#F59E0B',
  liabilities: '#F43F5E',
}

/** The web's composition toggle: everything, what you own, or what you owe. */
export const COMPOSITION_VIEWS = ['netWorth', 'assetsAndAccounts', 'liabilities'] as const
export type CompositionView = (typeof COMPOSITION_VIEWS)[number]

/** Distinct colours for individual accounts and assets (the long tail shares `OTHER_COLOR`). */
export const ITEM_PALETTE = ['#6366F1', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#14B8A6', '#8B5CF6', '#F97316', '#06B6D4', '#84CC16']
export const OTHER_COLOR = '#94A3B8'

export type NetWorthPoint = Report['trend'][number]
export type CompositionItem = NonNullable<NetWorthPoint['composition']>[number]

export interface GroupTotals {
  accounts: number
  assets: number
  liabilities: number
  net: number
}

/** Actual snapshots only (net worth has no forecast today, but keep parity with the other reports). */
export function netWorthTrend(report: Report): NetWorthPoint[] {
  const forecastStart = report.meta.forecast_start_date
  return forecastStart ? report.trend.filter((point) => point.date < forecastStart) : report.trend
}

function breakdown(point: NetWorthPoint, key: NetWorthGroup): number {
  const value = (point.breakdowns as Record<string, number> | undefined)?.[key]
  return typeof value === 'number' ? value : 0
}

export function groupTotals(point: NetWorthPoint): GroupTotals {
  return {
    accounts: breakdown(point, 'accounts'),
    assets: breakdown(point, 'assets'),
    liabilities: breakdown(point, 'liabilities'),
    net: point.value,
  }
}

/**
 * One stacked bar per snapshot: accounts and assets above zero, debts below,
 * as the web chart draws them (`stackOffset="sign"`).
 */
export function breakdownGroups(trend: NetWorthPoint[], label: (date: string) => string): BarGroup[] {
  return trend.map((point) => ({
    label: label(point.date),
    values: [breakdown(point, 'accounts'), breakdown(point, 'assets'), -breakdown(point, 'liabilities')],
  }))
}

/** A composition item's contribution to net worth: debts count against it. */
export function signedValue(item: CompositionItem): number {
  return item.group === 'liabilities' ? -item.value : item.value
}

/**
 * Colour per account/asset, by size at the end of the range, so a holding keeps
 * its colour while you tap through earlier dates (like the web's stable map).
 */
export function itemColors(items: CompositionItem[]): Map<string, string> {
  const sorted = [...items].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
  return new Map(sorted.map((item, i) => [item.key, ITEM_PALETTE[i] ?? OTHER_COLOR]))
}

/** Which composition groups a toggle position shows. */
export function groupsFor(view: CompositionView): NetWorthGroup[] {
  if (view === 'assetsAndAccounts') return ['accounts', 'assets']
  if (view === 'liabilities') return ['liabilities']
  return [...NET_WORTH_GROUPS]
}

export interface CompositionRow {
  key: string
  label: string
  group: NetWorthGroup
  /** Always positive; `group` says whether it is owned or owed. */
  value: number
  /** Share of the rows shown (0–1). */
  share: number
  color: string
}

/** The holdings a toggle position shows, grouped (accounts, assets, debts) and largest first. */
export function compositionRows(items: CompositionItem[], view: CompositionView, colors: Map<string, string>): CompositionRow[] {
  const groups = groupsFor(view)
  const rows = items.filter((item) => groups.includes(item.group as NetWorthGroup) && item.value > 0)
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  return rows
    .sort(
      (a, b) =>
        groups.indexOf(a.group as NetWorthGroup) - groups.indexOf(b.group as NetWorthGroup) ||
        b.value - a.value ||
        a.label.localeCompare(b.label),
    )
    .map((item) => ({
      key: item.key,
      label: item.label,
      group: item.group as NetWorthGroup,
      value: item.value,
      share: total ? item.value / total : 0,
      color: colors.get(item.key) ?? OTHER_COLOR,
    }))
}

/**
 * Each account/asset's contribution over time (debts negative), the `max`
 * largest at the end of the range as their own lines and the rest summed into
 * one "Other" line. Snapshots where an item is missing count as zero.
 */
export function itemSeries(
  trend: NetWorthPoint[],
  colors: Map<string, string>,
  { max = 5, otherKey = '__other', otherLabel }: { max?: number; otherKey?: string; otherLabel: string },
): ChartSeries[] {
  const names = new Map<string, string>()
  const byPoint = trend.map((point) => {
    const values = new Map<string, number>()
    for (const item of point.composition ?? []) {
      names.set(item.key, item.label)
      values.set(item.key, (values.get(item.key) ?? 0) + signedValue(item))
    }
    return values
  })
  const last = byPoint.at(-1) ?? new Map<string, number>()
  // Rank by size at the end, then by the largest size ever (for holdings sold during the range).
  const peak = (key: string) => Math.max(...byPoint.map((values) => Math.abs(values.get(key) ?? 0)))
  const ranked = [...names.keys()].sort(
    (a, b) => Math.abs(last.get(b) ?? 0) - Math.abs(last.get(a) ?? 0) || peak(b) - peak(a) || a.localeCompare(b),
  )
  const top = ranked.slice(0, max)
  const rest = ranked.slice(max)
  const series: ChartSeries[] = top.map((key) => ({
    key,
    name: names.get(key) ?? key,
    color: colors.get(key) ?? OTHER_COLOR,
    values: byPoint.map((values) => values.get(key) ?? 0),
  }))
  if (rest.length) {
    const values = byPoint.map((point) => rest.reduce((sum, key) => sum + (point.get(key) ?? 0), 0))
    if (values.some((v) => v !== 0)) series.push({ key: otherKey, name: otherLabel, color: OTHER_COLOR, values })
  }
  return series
}

/**
 * The snapshot the user tapped (by bucket label), or the latest. A label that is
 * no longer in the trend (the range changed) falls back to the latest.
 */
export function selectedSnapshot(trend: NetWorthPoint[], label: string | null): { point: NetWorthPoint | null; index: number; isLatest: boolean } {
  if (!trend.length) return { point: null, index: -1, isLatest: true }
  const found = label == null ? -1 : trend.findIndex((p) => p.date === label)
  const index = found === -1 ? trend.length - 1 : found
  return { point: trend[index]!, index, isLatest: index === trend.length - 1 }
}

/** Net worth at the start of the range, from the server's summary (current minus its change). */
export function baselineValue(report: Report): number {
  return report.summary.primary_value - report.summary.change_amount
}
