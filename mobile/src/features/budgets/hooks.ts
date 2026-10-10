import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'
import type { BudgetVsActual } from '@/api/types'
import { useWorkspaceKey } from '@/features/session/hooks'

/** Budget vs actual for a month given as `yyyy-MM`. */
export function useBudgetComparison(month: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'budgets', 'comparison', month],
    queryFn: () =>
      unwrap<BudgetVsActual[]>(
        api().GET('/api/budgets/comparison', { params: { query: { month: `${month}-01` } } }),
      ),
  })
}

export type Budget = components['schemas']['BudgetRead']

/** The budgets in effect for a month (`yyyy-MM`): its own plus recurring ones carried forward. */
export function useBudgets(month: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'budgets', 'list', month],
    queryFn: () => unwrap<Budget[]>(api().GET('/api/budgets', { params: { query: { month: `${month}-01` } } })),
  })
}

function useBudgetMutation<A, R>(fn: (args: A) => Promise<R>) {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => void queryClient.invalidateQueries({ queryKey: [ws, 'budgets'] }) })
}

export function useCreateBudget() {
  return useBudgetMutation((body: components['schemas']['BudgetCreate']) => unwrap<Budget>(api().POST('/api/budgets', { body })))
}

export function useUpdateBudget() {
  return useBudgetMutation(({ id, body }: { id: string; body: components['schemas']['BudgetUpdate'] }) =>
    unwrap<Budget>(api().PATCH('/api/budgets/{budget_id}', { params: { path: { budget_id: id } }, body })),
  )
}

export function useDeleteBudget() {
  return useBudgetMutation((id: string) => unwrap<unknown>(api().DELETE('/api/budgets/{budget_id}', { params: { path: { budget_id: id } } })))
}
