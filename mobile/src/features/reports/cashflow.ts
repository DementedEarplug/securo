import type { components } from '@/api/schema'
import type { Report } from '@/api/types'
import { delta, reportTotals, type Delta } from './compare'

export type ProjectedTransaction = components['schemas']['ProjectedTransaction']

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

// ---------------------------------------------------------------- income vs expenses

/**
 * Share of income kept, in percent: (income − expenses) / income. Null when
 * there was no income, since a rate of nothing means nothing.
 */
export function savingsRate(income: number, expenses: number): number | null {
  if (!(income > 0)) return null
  return round(((income - expenses) / income) * 100, 1)
}

export interface FlowBucket {
  /** The bucket's label from the server (`yyyy-MM`, `yyyy-Www`, `yyyy-MM-dd`, `yyyy`). */
  date: string
  income: number
  expenses: number
  net: number
  savingsRate: number | null
}

/** Income, expenses, net and savings rate per bucket (actual buckets only). */
export function flowBuckets(report: Report): FlowBucket[] {
  const forecastStart = report.meta.forecast_start_date
  return report.trend
    .filter((point) => !forecastStart || point.date < forecastStart)
    .map((point) => {
      const breakdowns = point.breakdowns ?? {}
      const income = breakdowns.income ?? 0
      const expenses = breakdowns.expenses ?? 0
      return { date: point.date, income, expenses, net: round(income - expenses), savingsRate: savingsRate(income, expenses) }
    })
}

export interface SavingsRateChange {
  current: number | null
  previous: number | null
  /** Percentage points; null when either side has no rate. */
  points: number | null
}

export interface FlowSummary {
  income: Delta
  expenses: Delta
  net: Delta
  savingsRate: SavingsRateChange
}

/** Totals for a range against the period before it (when loaded). */
export function flowSummary(current: Report, previous?: Report): FlowSummary {
  const now = reportTotals(current)
  const before = previous ? reportTotals(previous) : { income: 0, expenses: 0 }
  const rateNow = savingsRate(now.income, now.expenses)
  const rateBefore = previous ? savingsRate(before.income, before.expenses) : null
  return {
    income: delta(now.income, before.income),
    expenses: delta(now.expenses, before.expenses),
    net: delta(round(now.income - now.expenses), round(before.income - before.expenses)),
    savingsRate: {
      current: rateNow,
      previous: rateBefore,
      points: rateNow != null && rateBefore != null ? round(rateNow - rateBefore, 1) : null,
    },
  }
}

// ---------------------------------------------------------------- cash-flow forecast

/** Forecast lengths the server accepts (`months`, 1–12), as the web offers them. */
export const CASH_FLOW_HORIZONS = [3, 6, 12] as const
export type CashFlowHorizon = (typeof CASH_FLOW_HORIZONS)[number]

/** Cash flow buckets by day, week or month (the server has no yearly option here). */
export const CASH_FLOW_INTERVALS = ['daily', 'weekly', 'monthly'] as const
export type CashFlowInterval = (typeof CASH_FLOW_INTERVALS)[number]

export interface CashFlowPoint {
  date: string
  /** Balance at the end of the bucket. */
  balance: number
  inflow: number
  outflow: number
  /** After today: projected, not booked. */
  forecast: boolean
}

/**
 * The chart's points. The server sends about a month of actual history, then
 * the projection; `forecast_start_date` is the bucket holding today, which
 * still counts as actual.
 */
export function cashFlowPoints(report: Report): CashFlowPoint[] {
  const start = report.meta.forecast_start_date
  return report.trend.map((point) => ({
    date: point.date,
    balance: point.value,
    inflow: point.breakdowns?.inflow ?? 0,
    outflow: point.breakdowns?.outflow ?? 0,
    forecast: start ? point.date > start : false,
  }))
}

/** Index of today's bucket (the last actual one), or null without a forecast. */
export function todayIndex(points: CashFlowPoint[]): number | null {
  const first = points.findIndex((p) => p.forecast)
  if (first === -1) return null
  return Math.max(0, first - 1)
}

export interface CashFlowTotals {
  starting: number
  projectedIncome: number
  projectedExpenses: number
  ending: number
  change: number
  changePercent: number | null
}

/** The summary the server computes: today's balance, what's projected to come in and go out, and where it ends. */
export function cashFlowTotals(report: Report): CashFlowTotals {
  const value = (key: string) => report.summary.breakdowns.find((b) => b.key === key)?.value ?? 0
  return {
    starting: value('startingBalance'),
    projectedIncome: value('projectedIncome'),
    projectedExpenses: value('projectedExpenses'),
    ending: value('endingBalance'),
    change: report.summary.change_amount,
    changePercent: report.summary.change_percent ?? null,
  }
}

/** The lowest projected balance (the point to watch), or null without a forecast. */
export function lowestProjected(points: CashFlowPoint[]): CashFlowPoint | null {
  let low: CashFlowPoint | null = null
  for (const point of points) {
    if (point.forecast && (low === null || point.balance < low.balance)) low = point
  }
  return low
}

/** Signed amount in the primary currency: money in is positive. */
export function projectedAmount(item: ProjectedTransaction): number {
  const amount = Math.abs(item.amount_primary ?? item.amount)
  return item.type === 'credit' ? amount : -amount
}

/**
 * Upcoming recurring transactions on the chosen accounts (all when none are
 * chosen), soonest first, then largest.
 */
export function upcomingFlows(items: ProjectedTransaction[], accountIds: string[]): ProjectedTransaction[] {
  const accounts = new Set(accountIds)
  return items
    .filter((item) => !accounts.size || (item.account_id != null && accounts.has(item.account_id)))
    .sort((a, b) => a.date.localeCompare(b.date) || Math.abs(projectedAmount(b)) - Math.abs(projectedAmount(a)))
}
