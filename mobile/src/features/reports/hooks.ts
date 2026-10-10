import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { api, unwrap } from '@/api/client'
import type { Report } from '@/api/types'
import { useWorkspaceKey } from '@/features/session/hooks'
import type { ReportQuery } from './filters'
import { localizeReport } from './labels'

/**
 * Income and expenses for an explicit range (see `reportQuery`): totals,
 * per-bucket trend, per-category composition and per-category trend.
 */
export function useIncomeExpenses(query: ReportQuery, { enabled = true }: { enabled?: boolean } = {}) {
  const ws = useWorkspaceKey()
  const { t } = useTranslation()
  return useQuery({
    queryKey: [ws, 'reports', 'income-expenses', 'range', query],
    queryFn: () => unwrap<Report>(api().GET('/api/reports/income-expenses', { params: { query } })),
    // The server names its catch-all buckets in English; show them in the app's language.
    select: (report) => localizeReport(report, t),
    enabled,
  })
}

/** Net worth over an explicit range. */
export function useNetWorth(query: ReportQuery, { enabled = true }: { enabled?: boolean } = {}) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'reports', 'net-worth', 'range', query],
    queryFn: () => unwrap<Report>(api().GET('/api/reports/net-worth', { params: { query } })),
    enabled,
  })
}
