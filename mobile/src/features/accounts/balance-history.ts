import { addDays, addMonths, addYears, getDaysInMonth } from 'date-fns'

import { fromIsoDate, toIsoDate } from '@/lib/dates'

/** One day of `GET /api/accounts/{id}/balance-history` (the endpoint has no response model). */
export interface BalancePoint {
  date: string
  balance: number
  balance_primary?: number
}

export const HISTORY_RANGES = ['1M', '3M', '6M', '1Y', 'all'] as const
export type HistoryRange = (typeof HISTORY_RANGES)[number]

/** The dates a range covers, ending today. `all` starts at the account's first transaction. */
export function historyRange(range: HistoryRange, today: Date, firstDate?: string | null): { from: string; to: string } {
  const to = toIsoDate(today)
  const back = (date: Date) => toIsoDate(addDays(date, 1))
  switch (range) {
    case '1M':
      return { from: back(addMonths(today, -1)), to }
    case '3M':
      return { from: back(addMonths(today, -3)), to }
    case '6M':
      return { from: back(addMonths(today, -6)), to }
    case '1Y':
      return { from: back(addYears(today, -1)), to }
    case 'all': {
      // The day before the first transaction shows where the account started.
      const from = firstDate && firstDate < to ? toIsoDate(addDays(fromIsoDate(firstDate), -1)) : back(addYears(today, -1))
      return { from, to }
    }
  }
}

/**
 * Show the series with the same sign as the balance in the header. The server
 * flips connected credit cards so the amount owed is positive, while manual
 * cards keep the ledger sign; matching the latest point to the displayed
 * balance keeps the chart and the header telling the same story.
 */
export function alignSign(points: BalancePoint[], displayed: number): BalancePoint[] {
  const last = points.at(-1)?.balance ?? 0
  if (!last || !displayed || Math.sign(last) === Math.sign(displayed)) return points
  return points.map((p) => ({ ...p, balance: -p.balance, ...(p.balance_primary != null ? { balance_primary: -p.balance_primary } : {}) }))
}

/**
 * At most `max` points for the chart: evenly spaced, always keeping the first
 * and the last (today's) point.
 */
export function downsample<T>(points: T[], max = 60): T[] {
  if (points.length <= max) return points
  const step = (points.length - 1) / (max - 1)
  const picked: T[] = []
  for (let i = 0; i < max; i++) picked.push(points[Math.round(i * step)]!)
  return picked
}

/**
 * The billing cycle containing `reference`, as the web account page computes
 * it: from the last statement close day to the day before the next one. Without
 * a close day, the previous month through `reference`.
 */
export function cycleBounds(closeDay: number | null | undefined, reference: Date): { from: string; to: string } {
  const ref = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate())
  if (!closeDay) {
    return { from: toIsoDate(new Date(ref.getFullYear(), ref.getMonth() - 1, 1)), to: toIsoDate(ref) }
  }
  const clamp = (y: number, m: number) => Math.min(closeDay, getDaysInMonth(new Date(y, m, 1)))
  const y = ref.getFullYear()
  const m = ref.getMonth()
  const thisMonthClose = new Date(y, m, clamp(y, m))
  const nextClose =
    thisMonthClose.getTime() > ref.getTime() ? thisMonthClose : new Date(y, m + 1, clamp(new Date(y, m + 1, 1).getFullYear(), new Date(y, m + 1, 1).getMonth()))
  const prev = new Date(nextClose.getFullYear(), nextClose.getMonth() - 1, 1)
  const start = new Date(prev.getFullYear(), prev.getMonth(), clamp(prev.getFullYear(), prev.getMonth()))
  return { from: toIsoDate(start), to: toIsoDate(addDays(nextClose, -1)) }
}
