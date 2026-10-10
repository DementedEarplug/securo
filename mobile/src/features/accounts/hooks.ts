import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap, unwrapAs } from '@/api/client'
import type { components } from '@/api/schema'
import type { Account, DashboardSummary } from '@/api/types'
import { invalidateFinancialQueries } from '@/features/transactions/hooks'
import { useWorkspaceKey } from '@/features/session/hooks'

export function useAccounts({ includeClosed = false }: { includeClosed?: boolean } = {}) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'accounts', { includeClosed }],
    queryFn: () =>
      unwrap<Account[]>(api().GET('/api/accounts', { params: { query: { include_closed: includeClosed } } })),
  })
}

export function useAccount(id: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'accounts', id],
    queryFn: async () => {
      const path = { params: { path: { account_id: id } } }
      // The single-account endpoint leaves `current_balance` at 0; the summary
      // computes it (as the list does), so the header matches the accounts list.
      const [account, summary] = await Promise.all([
        unwrap<Account>(api().GET('/api/accounts/{account_id}', path)),
        unwrap(api().GET('/api/accounts/{account_id}/summary', path)),
      ])
      return { ...account, current_balance: summary.current_balance }
    },
    enabled: Boolean(id),
  })
}

export function useDashboardSummary() {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'dashboard', 'summary'],
    queryFn: () => unwrap<DashboardSummary>(api().GET('/api/dashboard/summary')),
  })
}

/** The balance the web app shows for an account, in the account's currency. */
export function accountBalance(account: Account): number {
  return Number(account.current_balance ?? account.balance)
}

export interface Currency {
  code: string
  symbol: string
  name: string
  flag?: string
}

export function useCurrencies() {
  return useQuery({
    queryKey: ['currencies'],
    queryFn: () => unwrapAs<Currency[]>(api().GET('/api/currencies')),
    staleTime: Infinity,
  })
}

function useAccountMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      invalidateFinancialQueries(queryClient, ws)
      void queryClient.invalidateQueries({ queryKey: [ws, 'connections'] })
    },
  })
}

export function useCreateAccount() {
  return useAccountMutation((body: components['schemas']['AccountCreate']) =>
    unwrap<Account>(api().POST('/api/accounts', { body })),
  )
}

export function useUpdateAccount(id: string) {
  return useAccountMutation((body: components['schemas']['AccountUpdate']) =>
    unwrap<Account>(api().PATCH('/api/accounts/{account_id}', { params: { path: { account_id: id } }, body })),
  )
}

export function useDeleteAccount() {
  return useAccountMutation((id: string) =>
    unwrap<unknown>(api().DELETE('/api/accounts/{account_id}', { params: { path: { account_id: id } } })),
  )
}

export function useSetAccountClosed() {
  return useAccountMutation(({ id, closed }: { id: string; closed: boolean }) =>
    closed
      ? unwrap<Account>(api().POST('/api/accounts/{account_id}/close', { params: { path: { account_id: id } } }))
      : unwrap<Account>(api().POST('/api/accounts/{account_id}/reopen', { params: { path: { account_id: id } } })),
  )
}

/** The name Securo shows for an account (the user's rename wins). */
export function accountName(account: Account): string {
  return account.display_name || account.name
}

/**
 * Picker options for accounts. Bank connections often give every account the
 * bank's name, so the bank's own account name is shown underneath when it
 * differs, next to the currency.
 */
export function accountOptions(accounts: Account[]): { value: string; label: string; detail: string | null }[] {
  return accounts.map((account) => ({
    value: account.id,
    label: accountName(account),
    detail:
      [account.display_name && account.display_name !== account.name ? account.name : null, account.currency]
        .filter(Boolean)
        .join(' · ') || null,
  }))
}

export function accountNameById(accounts: Account[], id: string | null | undefined): string | null {
  const account = id ? accounts.find((a) => a.id === id) : undefined
  return account ? accountName(account) : null
}
