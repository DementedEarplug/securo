import { addDays, endOfMonth, getDaysInMonth } from 'date-fns'

import type { Report } from '@/api/types'
import { fromIsoDate, shiftMonth, toIsoDate } from '@/lib/dates'
import { delta, type Delta } from './compare'
import type { DateRange } from './filters'

export interface MonthWindow {
  /** `yyyy-MM`. */
  month: string
  /** The whole month (for drill-down and the previous month). */
  full: DateRange
  /** The month up to today (the reports API refuses future end dates). */
  elapsed: DateRange
  days: number
  /** Last day with data: today in the current month, the month's last day before it. */
  cutoffDay: number
  isCurrent: boolean
}

/** The month being viewed and how much of it has happened. */
export function monthWindow(month: string, today: Date = new Date()): MonthWindow {
  const start = fromIsoDate(`${month}-01`)
  const end = endOfMonth(start)
  const todayIso = toIsoDate(today)
  const isCurrent = todayIso.slice(0, 7) === month
  const days = getDaysInMonth(start)
  const cutoffDay = isCurrent ? today.getDate() : days
  const full = { from: toIsoDate(start), to: toIsoDate(end) }
  return {
    month,
    full,
    elapsed: isCurrent ? { from: full.from, to: todayIso } : full,
    days,
    cutoffDay,
    isCurrent,
  }
}

export function previousMonth(month: string): string {
  return shiftMonth(month, -1)
}

/** The month after `month`, or null when that would be in the future. */
export function nextMonth(month: string, today: Date = new Date()): string | null {
  const next = shiftMonth(month, 1)
  return next > toIsoDate(today).slice(0, 7) ? null : next
}

/**
 * Running total of one daily breakdown (`expenses` by default) for each day
 * of a range, from a `daily` income-expenses report. Days missing from the
 * report count as zero; the result has one value per day from `range.from`
 * to `range.to`.
 */
export function cumulativeDaily(report: Report, range: DateRange, key: 'expenses' | 'income' = 'expenses'): number[] {
  const byDay = new Map<string, number>()
  for (const point of report.trend) {
    const value = (point.breakdowns as Record<string, number> | undefined)?.[key]
    if (typeof value === 'number') byDay.set(point.date.slice(0, 10), (byDay.get(point.date.slice(0, 10)) ?? 0) + value)
  }
  const values: number[] = []
  let running = 0
  for (let day = fromIsoDate(range.from); toIsoDate(day) <= range.to; day = addDays(day, 1)) {
    running += byDay.get(toIsoDate(day)) ?? 0
    values.push(round(running))
  }
  return values
}

/** Daily balances up to the last known day (the server sends `null` after today). */
export function knownBalances(days: { day: number; balance?: number | null }[]): number[] {
  const values: number[] = []
  for (const point of [...days].sort((a, b) => a.day - b.day)) {
    if (point.balance == null) break
    values.push(point.balance)
  }
  return values
}

/**
 * This month so far against last month by the same day of the month (or its
 * last day, when last month was shorter). Null when either side has no data.
 */
export function onPace(current: number[], previous: number[], day: number): Delta | null {
  if (!current.length || !previous.length) return null
  const now = current[Math.min(day, current.length) - 1]!
  const then = previous[Math.min(day, previous.length) - 1]!
  return delta(now, then)
}

/** Axis labels: the day of the month, for the longer of the two months. */
export function dayLabels(...lengths: number[]): string[] {
  const days = Math.max(0, ...lengths)
  return Array.from({ length: days }, (_, i) => String(i + 1))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
