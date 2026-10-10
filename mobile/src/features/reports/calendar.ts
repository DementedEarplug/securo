import { addMonths, endOfMonth, getDay, getDaysInMonth } from 'date-fns'

import type { Report, Transaction } from '@/api/types'
import type { components } from '@/api/schema'
import { toIsoDate } from '@/lib/dates'
import type { DateRange } from './filters'

type Schemas = components['schemas']
export type ProjectedTransaction = Schemas['ProjectedTransaction']
export type RecurringRead = Schemas['RecurringTransactionRead']

/** What the calendar shades and marks. */
export type CalendarMode = 'both' | 'spending' | 'recurring'

/** Heat levels: 0 is a day with no spending, 4 the month's heaviest days. */
export const HEAT_LEVELS = [0, 1, 2, 3, 4] as const
export type HeatLevel = (typeof HEAT_LEVELS)[number]

/** `yyyy-MM` of a date. */
export function monthOf(date: Date): string {
  return toIsoDate(date).slice(0, 7)
}

export function shiftCalendarMonth(month: string, delta: number): string {
  return monthOf(addMonths(monthStart(month), delta))
}

function monthStart(month: string): Date {
  const [year, m] = month.split('-').map(Number) as [number, number]
  return new Date(year, m - 1, 1)
}

/** The month as an inclusive date range. */
export function monthRange(month: string): DateRange {
  const start = monthStart(month)
  return { from: toIsoDate(start), to: toIsoDate(endOfMonth(start)) }
}

/**
 * The month as weeks of seven cells: ISO dates, with `null` padding before
 * the 1st and after the last day. `weekStartsOn` 0 is Sunday.
 */
export function monthGrid(month: string, weekStartsOn: 0 | 1 = 0): (string | null)[][] {
  const start = monthStart(month)
  const lead = (getDay(start) - weekStartsOn + 7) % 7
  const days = getDaysInMonth(start)
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let day = 1; day <= days; day++) {
    cells.push(toIsoDate(new Date(start.getFullYear(), start.getMonth(), day)))
  }
  while (cells.length % 7) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/**
 * The part of a month spending can be asked for: the server refuses report
 * windows that end after today, and a future month has no spending yet.
 */
export function spendingRange(range: DateRange, today: string): DateRange | null {
  if (range.from > today) return null
  return { from: range.from, to: range.to < today ? range.to : today }
}

/** Spending per day (`yyyy-MM-dd` → amount) from a daily income-expenses report. */
export function dailySpending(report: Pick<Report, 'trend'> | undefined): Map<string, number> {
  const out = new Map<string, number>()
  for (const point of report?.trend ?? []) {
    const expenses = Number((point.breakdowns as Record<string, number> | undefined)?.expenses ?? 0)
    if (expenses > 0) out.set(point.date, expenses)
  }
  return out
}

/**
 * How dark a day is, relative to the month's heaviest day. A square-root
 * scale keeps ordinary days visible next to one big bill (rent would
 * otherwise wash every other day out to the lightest shade).
 */
export function heatLevel(value: number, max: number): HeatLevel {
  if (!(value > 0) || !(max > 0)) return 0
  const level = Math.ceil(Math.sqrt(Math.min(value / max, 1)) * 4)
  return Math.min(Math.max(level, 1), 4) as HeatLevel
}

/** Upcoming recurring items keyed by date, in date order within a day by amount. */
export function groupByDate<T extends { date: string; amount: number }>(items: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const item of items) {
    const list = out.get(item.date) ?? []
    list.push(item)
    out.set(item.date, list)
  }
  for (const list of out.values()) list.sort((a, b) => b.amount - a.amount)
  return out
}

const PERIODS_PER_YEAR: Record<string, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  yearly: 1,
}

/**
 * A per-occurrence amount as a per-month one, like the web's invoice
 * schedules: a weekly charge is 52 a year over 12 months, not four a month.
 */
export function monthlyEquivalent(amount: number, frequency: string): number {
  const periods = PERIODS_PER_YEAR[frequency] ?? 12
  return Math.round(((amount * periods) / 12) * 100) / 100
}

/** One recurring charge on the month's list. */
export interface RecurringOccurrence {
  key: string
  recurringId: string | null
  description: string
  date: string
  amount: number
  currency: string
  type: 'debit' | 'credit'
  categoryIcon: string | null
  categoryColor: string | null
  /** paid: a real transaction exists; due: date has passed but nothing was booked; upcoming: still ahead. */
  status: 'paid' | 'due' | 'upcoming'
}

/** A booked transaction; only those a recurring rule created or was linked to count. */
export type PaidRecurring = Pick<
  Transaction,
  'id' | 'recurring_transaction_id' | 'description' | 'date' | 'amount' | 'amount_primary' | 'currency' | 'type' | 'category'
>

/** Projections (not yet booked) and booked rows of the month, as one list in date order. */
export function monthOccurrences(
  projected: ProjectedTransaction[],
  paid: PaidRecurring[],
  today: string,
): RecurringOccurrence[] {
  const out: RecurringOccurrence[] = []
  for (const p of projected) {
    out.push({
      key: `p-${p.recurring_id}-${p.date}`,
      recurringId: p.recurring_id,
      description: p.description,
      date: p.date,
      amount: Number(p.amount_primary ?? p.amount),
      currency: p.currency,
      type: p.type === 'credit' ? 'credit' : 'debit',
      categoryIcon: p.category_icon ?? null,
      categoryColor: p.category_color ?? null,
      status: p.date < today ? 'due' : 'upcoming',
    })
  }
  for (const tx of paid) {
    if (!tx.recurring_transaction_id) continue
    out.push({
      key: `t-${tx.id}`,
      recurringId: tx.recurring_transaction_id,
      description: tx.description,
      date: tx.date,
      amount: Math.abs(Number(tx.amount_primary ?? tx.amount)),
      currency: tx.currency ?? '',
      type: tx.type === 'credit' ? 'credit' : 'debit',
      categoryIcon: tx.category?.icon ?? null,
      categoryColor: tx.category?.color ?? null,
      status: 'paid',
    })
  }
  return out.sort((a, b) => (a.date === b.date ? b.amount - a.amount : a.date < b.date ? -1 : 1))
}

export interface RecurringTotals {
  paid: number
  due: number
  upcoming: number
  /** Everything the month's recurring expenses add up to. */
  committed: number
  /** Recurring income expected or received this month. */
  income: number
}

export function recurringTotals(items: RecurringOccurrence[]): RecurringTotals {
  const totals: RecurringTotals = { paid: 0, due: 0, upcoming: 0, committed: 0, income: 0 }
  for (const item of items) {
    if (item.type === 'credit') {
      totals.income += item.amount
      continue
    }
    totals[item.status] += item.amount
    totals.committed += item.amount
  }
  for (const key of Object.keys(totals) as (keyof RecurringTotals)[]) totals[key] = Math.round(totals[key] * 100) / 100
  return totals
}

export interface Subscription {
  id: string
  description: string
  frequency: string
  amount: number
  currency: string
  monthly: number
  nextOccurrence: string | null
}

/**
 * Active recurring expenses (bills and subscriptions) with their per-month
 * cost, most expensive first. `accountIds` narrows them like the reports do.
 */
export function subscriptions(recurring: RecurringRead[], accountIds: string[] = []): { items: Subscription[]; monthly: number } {
  const items = recurring
    .filter((r) => r.is_active !== false && r.type === 'debit')
    .filter((r) => !accountIds.length || (r.account_id != null && accountIds.includes(r.account_id)))
    .map((r) => {
      const amount = Number(r.amount_primary ?? r.amount)
      return {
        id: r.id,
        description: r.description,
        frequency: r.frequency,
        amount,
        currency: r.currency,
        monthly: monthlyEquivalent(amount, r.frequency),
        nextOccurrence: r.next_occurrence ?? null,
      }
    })
    .sort((a, b) => b.monthly - a.monthly)
  const monthly = Math.round(items.reduce((sum, s) => sum + s.monthly, 0) * 100) / 100
  return { items, monthly }
}
