import type { Report } from '@/api/types'

export type FlowGroup = 'expenses' | 'income'

export interface Delta {
  current: number
  previous: number
  change: number
  /** Null when there is nothing to compare against (previous is 0). */
  percent: number | null
}

export interface CategoryDelta extends Delta {
  key: string
  label: string
  color: string
}

export interface PeriodComparison {
  income: Delta
  expenses: Delta
  net: Delta
  categories: CategoryDelta[]
}

export function delta(current: number, previous: number): Delta {
  const change = round(current - previous)
  return {
    current,
    previous,
    change,
    percent: previous === 0 ? null : round((change / Math.abs(previous)) * 100, 1),
  }
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** Income and expenses actually booked in a report (its summary breakdowns). */
export function reportTotals(report: Report): { income: number; expenses: number } {
  const value = (key: string) => report.summary.breakdowns.find((b) => b.key === key)?.value ?? 0
  return { income: value('income'), expenses: value('expenses') }
}

/** Category totals for one side (spending or income) of a report. */
export function groupComposition(report: Report, group: FlowGroup) {
  return (report.composition ?? []).filter((item) => item.group === group && item.value > 0)
}

/**
 * Compare two reports over different ranges: income, expenses and net, plus
 * each category of `group`, biggest change first. A category present in only
 * one period counts as 0 in the other.
 */
export function comparePeriods(current: Report, previous: Report, group: FlowGroup): PeriodComparison {
  const now = reportTotals(current)
  const before = reportTotals(previous)
  const byKey = new Map<string, CategoryDelta>()
  for (const item of groupComposition(current, group)) {
    byKey.set(item.key, { key: item.key, label: item.label, color: item.color, ...delta(item.value, 0) })
  }
  for (const item of groupComposition(previous, group)) {
    const existing = byKey.get(item.key)
    const currentValue = existing?.current ?? 0
    byKey.set(item.key, {
      key: item.key,
      label: existing?.label ?? item.label,
      color: existing?.color ?? item.color,
      ...delta(currentValue, item.value),
    })
  }
  const categories = [...byKey.values()].sort(
    (a, b) => Math.abs(b.change) - Math.abs(a.change) || b.current - a.current || a.label.localeCompare(b.label),
  )
  return {
    income: delta(now.income, before.income),
    expenses: delta(now.expenses, before.expenses),
    net: delta(round(now.income - now.expenses), round(before.income - before.expenses)),
    categories,
  }
}
