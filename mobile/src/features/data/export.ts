import { endOfMonth, endOfYear, startOfMonth, startOfYear, subMonths } from 'date-fns'

import { toIsoDate } from '@/lib/dates'

export const EXPORT_PERIODS = ['all', 'thisMonth', 'lastMonth', 'thisYear', 'custom'] as const
export type ExportPeriod = (typeof EXPORT_PERIODS)[number]

/** `from`/`to` (inclusive, `yyyy-MM-dd`) for a period; both absent means everything. */
export function periodRange(
  period: ExportPeriod,
  today: Date,
  custom: { from: string; to: string },
): { from?: string; to?: string } {
  switch (period) {
    case 'all':
      return {}
    case 'thisMonth':
      return { from: toIsoDate(startOfMonth(today)), to: toIsoDate(endOfMonth(today)) }
    case 'lastMonth': {
      const last = subMonths(today, 1)
      return { from: toIsoDate(startOfMonth(last)), to: toIsoDate(endOfMonth(last)) }
    }
    case 'thisYear':
      return { from: toIsoDate(startOfYear(today)), to: toIsoDate(endOfYear(today)) }
    case 'custom':
      // A reversed range is what the user meant the other way round.
      return custom.from <= custom.to ? { ...custom } : { from: custom.to, to: custom.from }
  }
}

export interface CsvExportOptions {
  from?: string
  to?: string
  accountIds?: string[]
  excludeIgnored?: boolean
  /** The transactions list's own filters, so "export" gives the rows on screen. */
  q?: string
  type?: 'debit' | 'credit'
  categoryIds?: string[]
}

/** The query string `GET /api/transactions/export` expects (lists as repeated keys). */
export function csvExportPath(options: CsvExportOptions): string {
  const params = new URLSearchParams()
  if (options.from) params.append('from', options.from)
  if (options.to) params.append('to', options.to)
  for (const id of options.accountIds ?? []) params.append('account_ids', id)
  for (const id of options.categoryIds ?? []) params.append('category_ids', id)
  if (options.q) params.append('q', options.q)
  if (options.type) params.append('type', options.type)
  if (options.excludeIgnored) params.append('exclude_ignored', 'true')
  const query = params.toString()
  return query ? `/api/transactions/export?${query}` : '/api/transactions/export'
}

export const MIN_BACKUP_PASSWORD = 8

export type BackupPasswordProblem = 'data.backup.passwordTooShort' | 'data.backup.passwordMismatch'

/** Same rules as the web dialog: optional, at least 8 characters, typed twice. */
export function checkBackupPassword(password: string, confirmation: string): BackupPasswordProblem | null {
  if (!password) return null
  if (password.length < MIN_BACKUP_PASSWORD) return 'data.backup.passwordTooShort'
  if (password !== confirmation) return 'data.backup.passwordMismatch'
  return null
}

/** The POST body: no password key at all for the plain archive. */
export function backupBody(password: string): string {
  return JSON.stringify(password ? { password } : {})
}
