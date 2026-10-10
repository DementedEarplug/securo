import {
  addMonths,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  endOfMonth,
  isLastDayOfMonth,
  startOfMonth,
  startOfYear,
  subDays,
} from 'date-fns'

import { fromIsoDate, toIsoDate } from '@/lib/dates'

export const RANGE_PRESETS = [
  'thisMonth',
  'lastMonth',
  'last3Months',
  'last6Months',
  'last12Months',
  'ytd',
  'lastYear',
  'custom',
] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]

export const REPORT_INTERVALS = ['daily', 'weekly', 'monthly', 'yearly'] as const
export type ReportInterval = (typeof REPORT_INTERVALS)[number]

/** An inclusive calendar range, both ends `yyyy-MM-dd`. */
export interface DateRange {
  from: string
  to: string
}

export interface ReportFilters {
  preset: RangePreset
  /** Used when `preset` is `custom`. */
  custom: DateRange
  interval: ReportInterval
  /** Empty means every account. */
  accountIds: string[]
}

export type ComparisonMode = 'previous' | 'lastYear'

export const DEFAULT_FILTERS: ReportFilters = {
  preset: 'last6Months',
  custom: { from: '', to: '' },
  interval: 'monthly',
  accountIds: [],
}

// The backend refuses custom windows wider than this (`_MAX_CUSTOM_RANGE_YEARS`).
const MAX_RANGE_YEARS = 10

function iso(date: Date): string {
  return toIsoDate(date)
}

/** "Last N months" includes the current month: N calendar months ending today. */
function lastMonths(today: Date, months: number): DateRange {
  return { from: iso(startOfMonth(addMonths(today, -(months - 1)))), to: iso(today) }
}

/**
 * The dates a filter covers. The end never passes today (the reports API
 * rejects future end dates), and a custom range is put in order and kept
 * within the API's maximum width.
 */
export function resolveRange(filters: Pick<ReportFilters, 'preset' | 'custom'>, today: Date = new Date()): DateRange {
  switch (filters.preset) {
    case 'thisMonth':
      return { from: iso(startOfMonth(today)), to: iso(today) }
    case 'lastMonth': {
      const last = addMonths(today, -1)
      return { from: iso(startOfMonth(last)), to: iso(endOfMonth(last)) }
    }
    case 'last3Months':
      return lastMonths(today, 3)
    case 'last6Months':
      return lastMonths(today, 6)
    case 'last12Months':
      return lastMonths(today, 12)
    case 'ytd':
      return { from: iso(startOfYear(today)), to: iso(today) }
    case 'lastYear': {
      const year = today.getFullYear() - 1
      return { from: `${year}-01-01`, to: `${year}-12-31` }
    }
    case 'custom': {
      const todayIso = iso(today)
      let { from, to } = filters.custom
      if (!from || !to) return lastMonths(today, 6)
      if (from > to) [from, to] = [to, from]
      if (to > todayIso) to = todayIso
      if (from > to) from = to
      const earliest = iso(addYears(fromIsoDate(to), -MAX_RANGE_YEARS))
      if (from < earliest) from = earliest
      return { from, to }
    }
  }
}

/** Number of days in an inclusive range. */
export function rangeDays(range: DateRange): number {
  return differenceInCalendarDays(fromIsoDate(range.to), fromIsoDate(range.from)) + 1
}

/** Shift a date by whole months, keeping a month-end date on the month end. */
function shiftMonthsKeepingEnd(value: string, months: number): string {
  const date = fromIsoDate(value)
  const shifted = addMonths(date, months)
  return iso(isLastDayOfMonth(date) ? endOfMonth(shifted) : shifted)
}

/**
 * The range to compare against.
 *
 * - `lastYear`: the same dates one year earlier.
 * - `previous`: the period just before. A range starting on the 1st moves back
 *   by the number of calendar months it touches, so "this month to date"
 *   compares with the same days of last month; any other range moves back by
 *   its own length in days.
 */
export function previousRange(range: DateRange, mode: ComparisonMode): DateRange {
  if (mode === 'lastYear') {
    return { from: shiftMonthsKeepingEnd(range.from, -12), to: shiftMonthsKeepingEnd(range.to, -12) }
  }
  const from = fromIsoDate(range.from)
  const to = fromIsoDate(range.to)
  if (from.getDate() === 1) {
    const months = differenceInCalendarMonths(to, from) + 1
    return { from: iso(addMonths(from, -months)), to: shiftMonthsKeepingEnd(range.to, -months) }
  }
  const days = rangeDays(range)
  return { from: iso(subDays(from, days)), to: iso(subDays(to, days)) }
}

/** Intervals that give a readable number of buckets for a range, finest first. */
export function validIntervals(range: DateRange): ReportInterval[] {
  const days = rangeDays(range)
  const valid: ReportInterval[] = []
  if (days <= 92) valid.push('daily')
  if (days >= 14 && days <= 731) valid.push('weekly')
  if (days >= 28) valid.push('monthly')
  if (days >= 365) valid.push('yearly')
  return valid.length ? valid : ['daily']
}

/** The interval a range starts with: days for a month, weeks for a quarter, months up to three years, then years. */
export function defaultInterval(range: DateRange): ReportInterval {
  const days = rangeDays(range)
  if (days <= 31) return 'daily'
  if (days <= 92) return 'weekly'
  if (days <= 1100) return 'monthly'
  return 'yearly'
}

/** The chosen interval if it suits the range, otherwise the range's default. */
export function effectiveInterval(filters: ReportFilters, range: DateRange = resolveRange(filters)): ReportInterval {
  return validIntervals(range).includes(filters.interval) ? filters.interval : defaultInterval(range)
}

export interface ReportQuery {
  start_date: string
  end_date: string
  interval: ReportInterval
  account_ids?: string[]
}

/**
 * Query parameters for `/api/reports/*`. Every preset is sent as an explicit
 * start/end so the report, its comparison and its drill-down all cover
 * exactly the same days.
 */
export function reportQuery(filters: ReportFilters, today: Date = new Date()): ReportQuery {
  const range = resolveRange(filters, today)
  return {
    start_date: range.from,
    end_date: range.to,
    interval: effectiveInterval(filters, range),
    ...(filters.accountIds.length ? { account_ids: filters.accountIds } : {}),
  }
}

/** A query for an explicit range (e.g. the comparison period) with the same accounts. */
export function rangeQuery(range: DateRange, interval: ReportInterval, accountIds: string[]): ReportQuery {
  return {
    start_date: range.from,
    end_date: range.to,
    interval,
    ...(accountIds.length ? { account_ids: accountIds } : {}),
  }
}
