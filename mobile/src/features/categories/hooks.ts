import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'
import type { Category, CategoryGroup } from '@/api/types'
import { useWorkspaceKey } from '@/features/session/hooks'
import { invalidateFinancialQueries } from '@/features/transactions/hooks'

type Schemas = components['schemas']
export type CategoryUsage = Schemas['CategoryUsageRead']

/** Every group with its categories, hidden ones included (the management view). */
export function useAllCategoryGroups() {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'category-groups', 'all'],
    queryFn: () => unwrap<CategoryGroup[]>(api().GET('/api/category-groups', { params: { query: { include_hidden: true } } })),
  })
}

export function useAllCategories() {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'categories', 'all'],
    queryFn: () => unwrap<Category[]>(api().GET('/api/categories', { params: { query: { include_hidden: true } } })),
  })
}

export async function fetchCategoryUsage(id: string): Promise<CategoryUsage> {
  return unwrap<CategoryUsage>(api().GET('/api/categories/{category_id}/usage', { params: { path: { category_id: id } } }))
}

/** Category changes rename and recolour rows everywhere: lists, budgets, reports. */
function useCategoryMutation<A, R>(fn: (args: A) => Promise<R>) {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ws, 'category-groups'] })
      void queryClient.invalidateQueries({ queryKey: [ws, 'categories'] })
      void queryClient.invalidateQueries({ queryKey: [ws, 'rules'] })
      invalidateFinancialQueries(queryClient, ws)
    },
  })
}

export function useSaveCategory() {
  return useCategoryMutation(
    ({ id, body, deactivateRules }: { id?: string; body: Schemas['CategoryUpdate']; deactivateRules?: boolean }) =>
      id
        ? unwrap<Category>(
            api().PATCH('/api/categories/{category_id}', {
              params: { path: { category_id: id }, query: deactivateRules ? { deactivate_rules: true } : {} },
              body,
            }),
          )
        : unwrap<Category>(api().POST('/api/categories', { body: body as Schemas['CategoryCreate'] })),
  )
}

export function useDeleteCategory() {
  return useCategoryMutation(({ id, transferTo }: { id: string; transferTo?: string | null }) =>
    unwrap<unknown>(
      api().DELETE('/api/categories/{category_id}', {
        params: { path: { category_id: id }, query: transferTo ? { transfer_to_category_id: transferTo } : {} },
      }),
    ),
  )
}

export function useSaveCategoryGroup() {
  return useCategoryMutation(({ id, body }: { id?: string; body: Schemas['CategoryGroupUpdate'] }) =>
    id
      ? unwrap<CategoryGroup>(api().PATCH('/api/category-groups/{group_id}', { params: { path: { group_id: id } }, body }))
      : unwrap<CategoryGroup>(api().POST('/api/category-groups', { body: body as Schemas['CategoryGroupCreate'] })),
  )
}

export function useDeleteCategoryGroup() {
  return useCategoryMutation((id: string) =>
    unwrap<unknown>(api().DELETE('/api/category-groups/{group_id}', { params: { path: { group_id: id } } })),
  )
}

/** In-use counts as one number, for "this category is used by N items". */
export function usageCount(usage: CategoryUsage): number {
  return (usage.transactions ?? 0) + (usage.budgets ?? 0) + (usage.recurring_transactions ?? 0) + (usage.rules?.length ?? 0)
}
