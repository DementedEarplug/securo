import { router } from 'expo-router'

/** Category key the reports use for transactions without a category. */
export const UNCATEGORIZED = 'uncategorized'

export interface DrillDownParams {
  /** Header of the list, e.g. "Groceries · Oct 2026". */
  title: string
  from?: string
  to?: string
  accountIds?: string[]
  /** May contain `uncategorized`. */
  categoryIds?: string[]
  payeeId?: string
  type?: 'debit' | 'credit'
  q?: string
}

/** Route params are strings: lists travel comma-separated. */
export function drillDownRouteParams(params: DrillDownParams): Record<string, string> {
  const out: Record<string, string> = { title: params.title }
  if (params.from) out.from = params.from
  if (params.to) out.to = params.to
  if (params.accountIds?.length) out.accountIds = params.accountIds.join(',')
  if (params.categoryIds?.length) out.categoryIds = params.categoryIds.join(',')
  if (params.payeeId) out.payeeId = params.payeeId
  if (params.type) out.type = params.type
  if (params.q) out.q = params.q
  return out
}

/** Read the list screen's params back. */
export function parseDrillDownParams(raw: Record<string, string | string[] | undefined>): DrillDownParams {
  const one = (key: string) => {
    const value = raw[key]
    return (Array.isArray(value) ? value[0] : value) || undefined
  }
  const list = (key: string) => one(key)?.split(',').filter(Boolean)
  const type = one('type')
  return {
    title: one('title') ?? '',
    from: one('from'),
    to: one('to'),
    accountIds: list('accountIds'),
    categoryIds: list('categoryIds'),
    payeeId: one('payeeId'),
    type: type === 'debit' || type === 'credit' ? type : undefined,
    q: one('q'),
  }
}

/** Open the transactions behind a number on a report. */
export function drillDown(params: DrillDownParams) {
  router.push({ pathname: '/transaction/list', params: drillDownRouteParams(params) })
}
