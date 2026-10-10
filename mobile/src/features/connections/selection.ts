import type { components } from '@/api/schema'

export type ConnectionAccount = components['schemas']['ConnectionAccountRead']

export interface InstitutionGroup {
  institution: string | null
  accounts: ConnectionAccount[]
}

/** Accounts under their bank, in the order the provider listed them. */
export function groupByInstitution(accounts: ConnectionAccount[]): InstitutionGroup[] {
  const groups = new Map<string | null, ConnectionAccount[]>()
  for (const account of accounts) {
    const key = account.institution_name ?? null
    groups.set(key, [...(groups.get(key) ?? []), account])
  }
  return [...groups].map(([institution, list]) => ({ institution, accounts: list }))
}

export function initiallyIncluded(accounts: ConnectionAccount[]): Set<string> {
  return new Set(accounts.filter((a) => a.included).map((a) => a.external_id))
}

export interface SelectionChange {
  excluded: string[]
  /** Being left out now, with imported history the user decides about. */
  losingHistory: ConnectionAccount[]
  /** Coming in with nothing imported yet, so the save imports them. */
  importing: ConnectionAccount[]
  changed: boolean
}

export function selectionChange(accounts: ConnectionAccount[], included: ReadonlySet<string>): SelectionChange {
  const excluded = accounts.filter((a) => !included.has(a.external_id))
  const losingHistory = excluded.filter((a) => a.included && a.account_id)
  const importing = accounts.filter((a) => included.has(a.external_id) && !a.account_id)
  const changed = accounts.some((a) => a.included !== included.has(a.external_id))
  return { excluded: excluded.map((a) => a.external_id), losingHistory, importing, changed }
}

/** What happens to an account with the current choice, for its row's subtitle. */
export type AccountState = 'imported' | 'notImported' | 'historyKept' | 'willImport' | 'willStop'

export function accountState(account: ConnectionAccount, included: boolean): AccountState {
  if (included) return account.account_id ? 'imported' : 'willImport'
  if (!account.account_id) return 'notImported'
  return account.included ? 'willStop' : 'historyKept'
}
