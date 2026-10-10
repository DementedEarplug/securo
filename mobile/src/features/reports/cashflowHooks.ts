import { useQuery } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import type { Report } from '@/api/types'
import { useWorkspaceKey } from '@/features/session/hooks'
import type { CashFlowHorizon, CashFlowInterval, ProjectedTransaction } from './cashflow'

export interface CashFlowQuery {
  months: CashFlowHorizon
  interval: CashFlowInterval
  baseline: boolean
  account_ids?: string[]
}

/** Balance over the last month and the projection ahead (`/api/reports/cash-flow`). */
export function useCashFlow(query: CashFlowQuery) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'reports', 'cash-flow', query],
    queryFn: () => unwrap<Report>(api().GET('/api/reports/cash-flow', { params: { query } })),
  })
}

/** Recurring transactions the server expects between two dates. */
export function useProjectedTransactions(from: string, to: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'dashboard', 'projected-transactions', { from, to }],
    queryFn: () =>
      unwrap<ProjectedTransaction[]>(api().GET('/api/dashboard/projected-transactions', { params: { query: { from, to } } })),
  })
}
