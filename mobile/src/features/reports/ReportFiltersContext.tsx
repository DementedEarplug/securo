import { createContext, useContext, useState, type ReactNode } from 'react'

import { useWorkspaceKey } from '@/features/session/hooks'
import {
  DEFAULT_FILTERS,
  defaultInterval,
  resolveRange,
  type DateRange,
  type RangePreset,
  type ReportFilters,
  type ReportInterval,
} from './filters'

interface ReportFiltersValue {
  filters: ReportFilters
  /** Pick a preset; the interval resets to the new range's default. */
  setPreset: (preset: RangePreset) => void
  /** Switch to a custom range; the interval resets to its default. */
  setCustomRange: (range: DateRange) => void
  setInterval: (interval: ReportInterval) => void
  setAccountIds: (accountIds: string[]) => void
  /** The report shown on the Reports tab. */
  reportKey: string | null
  setReportKey: (key: string) => void
}

// Kept for the app's lifetime, per workspace, so leaving the tab (or switching
// reports) doesn't lose the range someone picked.
const remembered = new Map<string, { filters: ReportFilters; reportKey: string | null }>()

const Context = createContext<ReportFiltersValue | null>(null)

function withDefaultInterval(filters: ReportFilters): ReportFilters {
  return { ...filters, interval: defaultInterval(resolveRange(filters)) }
}

export function ReportFiltersProvider({ children, initial }: { children: ReactNode; initial?: Partial<ReportFilters> }) {
  const ws = useWorkspaceKey()
  const [state, setState] = useState(() => ({
    ws,
    ...(remembered.get(ws) ?? { filters: withDefaultInterval({ ...DEFAULT_FILTERS, ...initial }), reportKey: null }),
  }))
  // A workspace switch starts from that workspace's own remembered filters.
  const current =
    state.ws === ws
      ? state
      : { ws, ...(remembered.get(ws) ?? { filters: withDefaultInterval({ ...DEFAULT_FILTERS, ...initial }), reportKey: null }) }

  const update = (next: { filters?: ReportFilters; reportKey?: string | null }) => {
    const merged = { filters: next.filters ?? current.filters, reportKey: next.reportKey !== undefined ? next.reportKey : current.reportKey }
    remembered.set(ws, merged)
    setState({ ws, ...merged })
  }
  const filters = current.filters
  // The React Compiler memoizes this object; no manual useMemo needed.
  const value: ReportFiltersValue = {
    filters,
    setPreset: (preset) => update({ filters: withDefaultInterval({ ...filters, preset }) }),
    setCustomRange: (range) => update({ filters: withDefaultInterval({ ...filters, preset: 'custom', custom: range }) }),
    setInterval: (interval) => update({ filters: { ...filters, interval } }),
    setAccountIds: (accountIds) => update({ filters: { ...filters, accountIds } }),
    reportKey: current.reportKey,
    setReportKey: (reportKey) => update({ reportKey }),
  }

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useReportFilters(): ReportFiltersValue {
  const value = useContext(Context)
  if (!value) throw new Error('useReportFilters must be used inside ReportFiltersProvider')
  return value
}

/** Test helper: forget every remembered workspace. */
export function resetRememberedReportFilters() {
  remembered.clear()
}
