import { useQuery } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import type { PaginatedTransactions } from '@/api/types'
import { useWorkspaceKey } from '@/features/session/hooks'
import type { ProjectedTransaction } from './calendar'
import type { DateRange } from './filters'

/**
 * Recurring occurrences in a range that haven't been booked yet. The endpoint
 * takes one account at most, so several accounts are filtered here.
 */
export function useProjectedTransactions(range: DateRange, accountIds: string[], { enabled = true } = {}) {
  const ws = useWorkspaceKey()
  const single = accountIds.length === 1 ? accountIds[0] : undefined
  return useQuery({
    queryKey: [ws, 'dashboard', 'projected', range, accountIds],
    enabled,
    queryFn: async () => {
      const rows = await unwrap<ProjectedTransaction[]>(
        api().GET('/api/dashboard/projected-transactions', {
          params: { query: { from: range.from, to: range.to, account_id: single } },
        }),
      )
      return accountIds.length > 1 ? rows.filter((r) => r.account_id != null && accountIds.includes(r.account_id)) : rows
    },
  })
}

// The list endpoint's page cap; a month of one household's rows fits.
const MONTH_LIMIT = 500

/**
 * The month's booked transactions that came from a recurring rule (paid
 * bills and received recurring income). The list endpoint can't filter by
 * rule, so the month is fetched and filtered here.
 */
export function useBookedRecurring(range: DateRange, accountIds: string[], { enabled = true } = {}) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'transactions', 'recurring-booked', range, accountIds],
    enabled,
    queryFn: async () => {
      const page = await unwrap<PaginatedTransactions>(
        api().GET('/api/transactions', {
          params: {
            query: {
              from: range.from,
              to: range.to,
              account_ids: accountIds.length ? accountIds : undefined,
              exclude_transfers: true,
              limit: MONTH_LIMIT,
              page: 1,
              sort_by: 'date',
              sort_dir: 'asc',
            },
          },
        }),
      )
      return page.items.filter((tx) => tx.recurring_transaction_id)
    },
  })
}
