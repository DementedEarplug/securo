import { useQuery } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'
import { useWorkspaceKey } from '@/features/session/hooks'
import { delta, type Delta } from './compare'
import type { DateRange } from './filters'

export type PayeeReport = components['schemas']['PayeeReportResponse']
export type PayeeReportItem = components['schemas']['PayeeReportItem']

/** How many payees the list shows; "Show more" steps through these (the API caps at 50). */
export const PAYEE_LIMITS = [10, 25, 50] as const
export type PayeeLimit = (typeof PAYEE_LIMITS)[number]

/** The next, longer list, or null when already showing the most the API returns. */
export function nextPayeeLimit(limit: PayeeLimit): PayeeLimit | null {
  const index = PAYEE_LIMITS.indexOf(limit)
  return PAYEE_LIMITS[index + 1] ?? null
}

export interface PayeeQuery {
  type: 'debit' | 'credit'
  start_date: string
  end_date: string
  limit: number
  account_ids?: string[]
}

export function payeeQuery(range: DateRange, type: 'debit' | 'credit', limit: number, accountIds: string[]): PayeeQuery {
  return {
    type,
    start_date: range.from,
    end_date: range.to,
    limit,
    ...(accountIds.length ? { account_ids: accountIds } : {}),
  }
}

/** Top payees for a range, with each one's total in the period just before it. */
export function usePayeeReport(query: PayeeQuery) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'reports', 'payees', query],
    queryFn: () => unwrap<PayeeReport>(api().GET('/api/reports/payees', { params: { query } })),
    // Keep the shorter list on screen while "Show more" loads the longer one.
    placeholderData: (previous) => previous,
  })
}

export interface PayeeRow {
  id: string
  name: string
  total: number
  count: number
  /** Share of everything spent (or received) in the range, 0–1; null when that total is unknown or 0. */
  share: number | null
  /** Bar length relative to the biggest payee, 0–1. */
  bar: number
  change: Delta
  /** Nothing with this payee in the previous period. */
  isNew: boolean
}

/**
 * Rows for the ranked list. `periodTotal` is the range's whole spending (or
 * income) from the income-vs-expenses report, so a payee's share counts the
 * payees past the list's limit and the rows without a payee too. Without it
 * the share falls back to what the response itself covers.
 */
export function payeeRows(report: PayeeReport, periodTotal: number | null): PayeeRow[] {
  const items = [...report.items].sort((a, b) => b.total - a.total)
  const top = items[0]?.total ?? 0
  const covered = items.reduce((sum, item) => sum + item.total, 0) + report.unassigned.total
  const whole = periodTotal != null && periodTotal > 0 ? periodTotal : covered > 0 ? covered : null
  return items.map((item) => ({
    id: item.payee_id,
    name: item.name,
    total: item.total,
    count: item.count,
    share: whole ? item.total / whole : null,
    bar: top > 0 ? item.total / top : 0,
    change: delta(item.total, item.previous_total),
    isNew: item.previous_total === 0 && item.total > 0,
  }))
}

/** "12.3%" for a share, or null. */
export function formatShare(share: number | null): string | null {
  return share == null ? null : `${(share * 100).toFixed(1)}%`
}
