import { addDays, endOfMonth, setISOWeek, setISOWeekYear, startOfISOWeek } from 'date-fns'

import { fromIsoDate, toIsoDate } from '@/lib/dates'
import type { DateRange, ReportInterval } from './filters'

/**
 * The dates a report bucket covers, from its label: `yyyy-MM-dd` (daily),
 * `yyyy-Www` (ISO week), `yyyy-MM` (monthly) or `yyyy` (yearly). Clamped to
 * `within`, since the first and last buckets are usually partial.
 */
export function bucketRange(label: string, within?: DateRange): DateRange {
  let range: DateRange
  const week = /^(\d{4})-W(\d{2})$/.exec(label)
  if (week) {
    // Jan 4th is always in ISO week 1 of its ISO year.
    const monday = startOfISOWeek(setISOWeek(setISOWeekYear(new Date(Number(week[1]), 0, 4), Number(week[1])), Number(week[2])))
    range = { from: toIsoDate(monday), to: toIsoDate(addDays(monday, 6)) }
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    range = { from: label, to: label }
  } else if (/^\d{4}-\d{2}$/.test(label)) {
    range = { from: `${label}-01`, to: toIsoDate(endOfMonth(fromIsoDate(`${label}-01`))) }
  } else if (/^\d{4}$/.test(label)) {
    range = { from: `${label}-01-01`, to: `${label}-12-31` }
  } else {
    range = within ?? { from: label, to: label }
  }
  if (!within) return range
  return {
    from: range.from < within.from ? within.from : range.from,
    to: range.to > within.to ? within.to : range.to,
  }
}

/** A short axis label for a bucket in the UI language. */
export function bucketLabel(label: string, interval: ReportInterval, language: string): string {
  try {
    if (interval === 'yearly') return label.slice(0, 4)
    if (interval === 'monthly') {
      return new Intl.DateTimeFormat(language, { month: 'short' }).format(fromIsoDate(`${label.slice(0, 7)}-01`))
    }
    const { from } = bucketRange(label)
    return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(fromIsoDate(from))
  } catch {
    return label
  }
}

/** "Oct 1 – Oct 9, 2026" (or a single date) for headings and accessibility labels. */
export function formatRange(range: DateRange, locale: string): string {
  try {
    const format = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
    const from = fromIsoDate(range.from)
    const to = fromIsoDate(range.to)
    if (range.from === range.to) return format.format(from)
    const short = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
    const start = from.getFullYear() === to.getFullYear() ? short.format(from) : format.format(from)
    return `${start} – ${format.format(to)}`
  } catch {
    return `${range.from} – ${range.to}`
  }
}
