import type { components } from '@/api/schema'
import { parseAmountInput } from '@/lib/format'
import { linesTotal, toLinePayload, validateLines, type LineValues } from './model'

type Schemas = components['schemas']
export type Schedule = Schemas['ScheduleRead']
export type ScheduleTerm = Schemas['ScheduleTermRead']
export type ScheduleSummary = Schemas['ScheduleSummaryRead']
export type SchedulePeriod = Schemas['SchedulePeriodRead']
export type ScheduleFrequency = Schedule['frequency']
export type ScheduleEndType = Schedule['end_type']
export type ScheduleEndReason = NonNullable<Schedule['end_reason']>

/**
 * Pure helpers for recurring invoices (mirrors the web's
 * `invoice-schedule-utils`). The server derives the money and the dates;
 * this only decides how to say them and what the forms send.
 */

export const FREQUENCIES: ScheduleFrequency[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'yearly']
export const END_TYPES: ScheduleEndType[] = ['never', 'on_date', 'after_count']
export const END_REASONS: ScheduleEndReason[] = ['canceled_by_client', 'canceled_by_us', 'completed', 'unpaid', 'other']
export const SCHEDULE_FILTERS = ['all', 'active', 'paused', 'ended'] as const
export type ScheduleFilter = (typeof SCHEDULE_FILTERS)[number]

/** Periods in a year per frequency; mirrors `PERIODS_PER_YEAR` on the server. */
const PERIODS_PER_YEAR: Record<ScheduleFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  yearly: 1,
}

/** A per-period amount as a per-month one: a weekly retainer is 52 periods over 12 months. */
export function monthlyEquivalent(amount: number, frequency: ScheduleFrequency): number {
  return Math.round(((amount * PERIODS_PER_YEAR[frequency]) / 12) * 100) / 100
}

/** What the status pill says. Past due and paused-after-failures outrank the stored status. */
export function scheduleLabel(
  schedule: Pick<Schedule, 'status' | 'pause_reason' | 'past_due_count'>,
): Schedule['status'] | 'past_due' | 'paused_failures' {
  if (schedule.status === 'paused' && schedule.pause_reason === 'failures') return 'paused_failures'
  if (schedule.status === 'active' && (schedule.past_due_count ?? 0) > 0) return 'past_due'
  return schedule.status
}

/** Which actions a schedule offers, from its stored decisions alone. */
export function scheduleActions(schedule: Pick<Schedule, 'status' | 'invoice_count' | 'origin'>) {
  const live = schedule.status !== 'ended'
  return {
    canPause: schedule.status === 'active',
    canResume: schedule.status === 'paused',
    canEnd: live,
    canEdit: live,
    canGenerate: schedule.status === 'active' && schedule.origin === 'local',
    canChangePrice: live,
    // Nothing was ever billed under it, so nothing is lost with it.
    canDelete: (schedule.invoice_count ?? 0) === 0,
    canLink: live,
  }
}

/** Whether a term is still ahead of today, and so may be edited or removed. */
export function isUpcomingTerm(effectiveFrom: string, today = new Date()): boolean {
  const start = new Date(`${effectiveFrom}T00:00:00`)
  const reference = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return start.getTime() > reference.getTime()
}

/** Terms in date order; the current one is the latest that has started. */
export function sortTerms(terms: ScheduleTerm[]): ScheduleTerm[] {
  return [...terms].sort((a, b) => a.effective_from.localeCompare(b.effective_from))
}

/** "5 Sep – 4 Oct 2026", as the web labels a period. */
export function periodLabel(start: string, end: string, locale: string): string {
  const from = new Date(`${start}T00:00:00`)
  const to = new Date(`${end}T00:00:00`)
  const formatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  if (typeof formatter.formatRange === 'function') {
    try {
      return formatter.formatRange(from, to)
    } catch {
      // Some engines expose it but throw; fall through.
    }
  }
  return `${formatter.format(from)} – ${formatter.format(to)}`
}

/** Today as `YYYY-MM-DD` in the device's calendar (not UTC, which is tomorrow in the evening). */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export interface EndValues {
  endType: ScheduleEndType
  endDate: string | null
  endCount: string
}

/** Only the field the chosen end needs; the other explicitly null so a PATCH clears it. */
export function endPayload({ endType, endDate, endCount }: EndValues) {
  return {
    end_type: endType,
    end_date: endType === 'on_date' && endDate ? endDate : null,
    end_count: endType === 'after_count' && endCount.trim() ? Number(endCount) : null,
  }
}

export function validateEnd({ endType, endDate, endCount }: EndValues): string | null {
  if (endType === 'on_date' && !endDate) return 'invoices.errors.end_date_required'
  if (endType === 'after_count' && !(Number.isInteger(Number(endCount)) && Number(endCount) >= 1)) {
    return 'invoices.errors.end_count_required'
  }
  return null
}

export interface ScheduleFormValues extends EndValues {
  name: string
  payeeId: string | null
  frequency: ScheduleFrequency
  startDate: string
  /** Blank means the workspace default at each generation. */
  paymentTerms: string
  currency: string
  notes: string
  lines: LineValues[]
}

function termsDays(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const days = Number(trimmed)
  return Number.isInteger(days) && days >= 0 ? days : Number.NaN
}

export function validateScheduleForm(values: ScheduleFormValues, locale: string, { withLines }: { withLines: boolean }): string | null {
  if (!values.name.trim()) return 'invoices.errors.name_required'
  if (!values.startDate) return 'invoices.schedules.form.startRequired'
  if (Number.isNaN(termsDays(values.paymentTerms))) return 'invoices.schedules.form.termsInvalid'
  const end = validateEnd(values)
  if (end) return end
  if (withLines) {
    if (values.lines.length === 0) return 'invoices.errors.term_lines_required'
    const lines = validateLines(values.lines, locale)
    if (lines) return lines
    if (linesTotal(values.lines, locale) <= 0) return 'invoices.errors.term_empty'
  }
  return null
}

export function toScheduleCreate(values: ScheduleFormValues, locale: string, showTax: boolean): Schemas['ScheduleCreate'] {
  return {
    name: values.name.trim(),
    payee_id: values.payeeId,
    frequency: values.frequency,
    start_date: values.startDate,
    ...endPayload(values),
    payment_terms_days: termsDays(values.paymentTerms),
    currency: values.currency,
    notes: values.notes.trim() || null,
    lines: values.lines.map((line) => toLinePayload(line, locale, showTax)),
  }
}

/** The frequency and start date are fixed once an invoice exists, so they are only sent before. */
export function toScheduleUpdate(values: ScheduleFormValues, { locked }: { locked: boolean }): Schemas['ScheduleUpdate'] {
  return {
    name: values.name.trim(),
    payee_id: values.payeeId,
    ...(locked ? {} : { frequency: values.frequency, start_date: values.startDate }),
    ...endPayload(values),
    payment_terms_days: termsDays(values.paymentTerms),
    notes: values.notes.trim() || null,
  }
}

export function toMakeRecurring(values: Pick<ScheduleFormValues, 'name' | 'frequency' | 'startDate'> & EndValues): Schemas['MakeRecurring'] {
  return {
    frequency: values.frequency,
    name: values.name.trim() || undefined,
    start_date: values.startDate,
    ...endPayload(values),
  }
}

export interface TermValues {
  effectiveFrom: string
  lines: LineValues[]
  discount: string
}

/** What a period bills under a term: its lines less the discount. */
export function termPerPeriod(values: TermValues, locale: string): number {
  return linesTotal(values.lines, locale) - (parseAmountInput(values.discount || '0', locale) ?? 0)
}

export function validateTerm(values: TermValues, locale: string): string | null {
  if (!values.effectiveFrom) return 'invoices.schedules.form.startRequired'
  if (values.lines.length === 0) return 'invoices.errors.term_lines_required'
  const lines = validateLines(values.lines, locale)
  if (lines) return lines
  const discount = values.discount.trim() ? parseAmountInput(values.discount, locale) : 0
  if (discount === null || discount < 0) return 'invoices.errors.negative_discount'
  if (termPerPeriod(values, locale) <= 0) return 'invoices.errors.term_empty'
  return null
}

export function toTermPayload(values: TermValues, locale: string, showTax: boolean): Schemas['ScheduleTermInput'] {
  const discount = values.discount.trim() ? parseAmountInput(values.discount, locale) : null
  return {
    effective_from: values.effectiveFrom,
    lines: values.lines.map((line) => toLinePayload(line, locale, showTax)),
    discount: discount === null ? null : String(discount),
  }
}
