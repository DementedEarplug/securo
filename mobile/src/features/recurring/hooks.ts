import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap, unwrapAs } from '@/api/client'
import type { components } from '@/api/schema'
import { useWorkspaceKey } from '@/features/session/hooks'
import { invalidateFinancialQueries } from '@/features/transactions/hooks'

type Schemas = components['schemas']
export type Recurring = Schemas['RecurringTransactionRead']

export function useRecurring() {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'recurring'],
    queryFn: () => unwrap<Recurring[]>(api().GET('/api/recurring-transactions')),
  })
}

function useRecurringMutation<A, R>(fn: (args: A) => Promise<R>) {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ws, 'recurring'] })
      // Generated rows and projections show up in lists, balances and reports.
      invalidateFinancialQueries(queryClient, ws)
    },
  })
}

export function useCreateRecurring() {
  return useRecurringMutation((body: Schemas['RecurringTransactionCreate']) =>
    unwrap<Recurring>(api().POST('/api/recurring-transactions', { body })),
  )
}

export function useUpdateRecurring(id: string) {
  return useRecurringMutation((body: Schemas['RecurringTransactionUpdate']) =>
    unwrap<Recurring>(
      api().PATCH('/api/recurring-transactions/{recurring_id}', { params: { path: { recurring_id: id } }, body }),
    ),
  )
}

export function useDeleteRecurring() {
  return useRecurringMutation((id: string) =>
    unwrap<unknown>(api().DELETE('/api/recurring-transactions/{recurring_id}', { params: { path: { recurring_id: id } } })),
  )
}

/** Create every occurrence that is due by today. */
export function useGenerateRecurring() {
  return useRecurringMutation(() =>
    unwrapAs<{ generated: number }>(api().POST('/api/recurring-transactions/generate')),
  )
}
