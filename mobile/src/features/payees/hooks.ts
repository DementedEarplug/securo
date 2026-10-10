import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'
import { useWorkspaceKey } from '@/features/session/hooks'
import { invalidateFinancialQueries } from '@/features/transactions/hooks'

type Schemas = components['schemas']
export type Payee = Schemas['PayeeRead']

export function usePayees(q = '') {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'payees', q],
    queryFn: () => unwrap<Payee[]>(api().GET('/api/payees', { params: { query: q ? { q } : {} } })),
  })
}

function usePayeeMutation<A, R>(fn: (args: A) => Promise<R>) {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ws, 'payees'] })
      invalidateFinancialQueries(queryClient, ws)
    },
  })
}

export function useSavePayee() {
  return usePayeeMutation(({ id, body }: { id?: string; body: Schemas['PayeeUpdate'] }) =>
    id
      ? unwrap<Payee>(api().PATCH('/api/payees/{payee_id}', { params: { path: { payee_id: id } }, body }))
      : unwrap<Payee>(api().POST('/api/payees', { body: body as Schemas['PayeeCreate'] })),
  )
}

export function useDeletePayee() {
  return usePayeeMutation((id: string) =>
    unwrap<unknown>(api().DELETE('/api/payees/{payee_id}', { params: { path: { payee_id: id } } })),
  )
}

/** Fold `sourceIds` into `targetId`: their transactions move to it. */
export function useMergePayees() {
  return usePayeeMutation((body: Schemas['PayeeMergeRequest']) => unwrap<unknown>(api().POST('/api/payees/merge', { body })))
}
