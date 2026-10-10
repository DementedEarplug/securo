import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'

/** `yyyy-MM-dd` for the API, from a local calendar date (no UTC shift). */
export function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** A `yyyy-MM-dd` string as a local Date at midnight. */
export function fromIsoDate(value: string): Date {
  return parseISO(value)
}

/** `yyyy-MM` of a date. */
export function toMonth(date: Date): string {
  return format(date, 'yyyy-MM')
}

/** Move a `yyyy-MM` month by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number) as [number, number]
  return toMonth(new Date(year, m - 1 + delta, 1))
}

export function formatDate(value: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(
      fromIsoDate(value),
    )
  } catch {
    return value
  }
}

/**
 * "October 2026": month names carry no day/month order, so pass the UI
 * language here, not the date-order locale (which may be an English proxy).
 */
export function formatMonth(month: string, locale: string): string {
  try {
    const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
      fromIsoDate(`${month}-01`),
    )
    // Languages that lower-case month names ("outubro de 2026") still start a
    // heading with a capital; only the first letter, as the web app does.
    return label.charAt(0).toUpperCase() + label.slice(1)
  } catch {
    return month
  }
}

/** Short month label for chart axes from a report bucket date (`yyyy-MM` or `yyyy-MM-dd`); takes the UI language. */
export function formatAxisMonth(value: string, locale: string): string {
  const iso = value.length === 7 ? `${value}-01` : value.slice(0, 10)
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short' }).format(fromIsoDate(iso))
  } catch {
    return value
  }
}

/** "5 minutes ago" in the UI language. */
export function formatRelative(iso: string, language: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: language === 'pt-BR' ? ptBR : enUS })
  } catch {
    return iso.slice(0, 10)
  }
}
