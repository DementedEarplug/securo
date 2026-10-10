import { endOfMonth, startOfMonth, subDays, subMonths } from 'date-fns'

import { toIsoDate } from '@/lib/dates'
import type { TransactionFilters } from './hooks'

export type Period = 'all' | 'thisMonth' | 'lastMonth' | 'last90'
export const PERIODS: Period[] = ['all', 'thisMonth', 'lastMonth', 'last90']

/** The `from`/`to` dates a quick period stands for, as of `today`. */
export function periodRange(period: Period, today = new Date()): Pick<TransactionFilters, 'from' | 'to'> {
  switch (period) {
    case 'thisMonth':
      return { from: toIsoDate(startOfMonth(today)), to: toIsoDate(endOfMonth(today)) }
    case 'lastMonth': {
      const last = subMonths(today, 1)
      return { from: toIsoDate(startOfMonth(last)), to: toIsoDate(endOfMonth(last)) }
    }
    case 'last90':
      return { from: toIsoDate(subDays(today, 90)), to: toIsoDate(today) }
    default:
      return {}
  }
}

export interface FilterState {
  type: 'all' | 'debit' | 'credit'
  period: Period
  accountIds: string[]
  categoryIds: string[]
}

export const NO_FILTERS: FilterState = { type: 'all', period: 'all', accountIds: [], categoryIds: [] }

export function activeFilterCount(state: FilterState): number {
  return (
    (state.type !== 'all' ? 1 : 0) +
    (state.period !== 'all' ? 1 : 0) +
    (state.accountIds.length ? 1 : 0) +
    (state.categoryIds.length ? 1 : 0)
  )
}

export function toQuery(state: FilterState, q: string): TransactionFilters {
  return {
    q: q.trim() || undefined,
    type: state.type === 'all' ? undefined : state.type,
    accountIds: state.accountIds,
    categoryIds: state.categoryIds,
    ...periodRange(state.period),
  }
}

/** Toggle `value` in a list, for multi-select pickers. */
export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}
