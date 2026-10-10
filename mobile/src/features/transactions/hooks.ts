import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import type {
  Category,
  CategoryGroup,
  PaginatedTransactions,
  Transaction,
  TransactionCreate,
  TransactionUpdate,
} from '@/api/types'
import type { components } from '@/api/schema'
import { useWorkspaceKey } from '@/features/session/hooks'
import { toInstallmentSeries, toRecurring, type Repeat } from './repeat'

export const PAGE_SIZE = 50

export interface TransactionFilters {
  q?: string
  accountIds?: string[]
  categoryIds?: string[]
  type?: 'debit' | 'credit'
  from?: string
  to?: string
  payeeId?: string
  /** Only rows without a category. */
  uncategorized?: boolean
  /**
   * Only the rows a report counts: posted, not ignored, not transfers. Used
   * when drilling into a report so the list adds up to the number tapped.
   */
  reportScope?: boolean
}

export function useTransactions(filters: TransactionFilters) {
  const ws = useWorkspaceKey()
  return useInfiniteQuery({
    queryKey: [ws, 'transactions', 'list', filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      unwrap<PaginatedTransactions>(
        api().GET('/api/transactions', {
          params: {
            query: {
              page: pageParam,
              limit: PAGE_SIZE,
              q: filters.q || undefined,
              account_ids: filters.accountIds?.length ? filters.accountIds : undefined,
              category_ids: filters.categoryIds?.length ? filters.categoryIds : undefined,
              type: filters.type,
              from: filters.from,
              to: filters.to,
              payee_id: filters.payeeId,
              ...(filters.uncategorized ? { uncategorized: true } : {}),
              ...(filters.reportScope ? { status: 'posted', exclude_ignored: true, exclude_transfers: true } : {}),
              sort_by: 'date',
              sort_dir: 'desc',
            },
          },
        }),
      ),
    getNextPageParam: (last) =>
      last.page * last.limit < last.total ? last.page + 1 : undefined,
  })
}

export function useTransaction(id: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'transactions', 'detail', id],
    queryFn: () =>
      unwrap<Transaction>(
        api().GET('/api/transactions/{transaction_id}', { params: { path: { transaction_id: id } } }),
      ),
  })
}

export function useCategoryGroups() {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'category-groups'],
    queryFn: () => unwrap<CategoryGroup[]>(api().GET('/api/category-groups')),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCategories() {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'categories'],
    queryFn: () => unwrap<Category[]>(api().GET('/api/categories')),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Everything a transaction write can change: lists, balances, budgets and
 * reports. Mirrors `invalidateFinancialQueries` in the web app.
 */
export function invalidateFinancialQueries(queryClient: QueryClient, ws: string) {
  for (const key of ['transactions', 'accounts', 'dashboard', 'budgets', 'reports']) {
    void queryClient.invalidateQueries({ queryKey: [ws, key] })
  }
}

export function useCreateTransaction() {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: TransactionCreate) =>
      unwrap<Transaction>(api().POST('/api/transactions', { body })),
    onSuccess: () => invalidateFinancialQueries(queryClient, ws),
  })
}

export function useUpdateTransaction(id: string) {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: TransactionUpdate) =>
      unwrap<Transaction>(
        api().PATCH('/api/transactions/{transaction_id}', {
          params: { path: { transaction_id: id } },
          body,
        }),
      ),
    onSuccess: () => invalidateFinancialQueries(queryClient, ws),
  })
}

export function useDeleteTransaction(id: string) {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (scope?: 'this' | 'future' | 'all') =>
      unwrap<unknown>(
        api().DELETE('/api/transactions/{transaction_id}', {
          params: { path: { transaction_id: id }, query: scope ? { apply_to: scope } : {} },
        }),
      ),
    onSuccess: () => invalidateFinancialQueries(queryClient, ws),
  })
}

/** Create a transaction, an installment plan, or a transaction plus its recurring entry. */
export function useCreateTransactionWithRepeat() {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ body, repeat, currency }: { body: TransactionCreate; repeat: Repeat; currency: string }) => {
      if (repeat.kind === 'installments') {
        const series = await unwrap<Transaction[]>(
          api().POST('/api/transactions/installments', { body: toInstallmentSeries(body, repeat) }),
        )
        return series[0]!
      }
      const created = await unwrap<Transaction>(api().POST('/api/transactions', { body }))
      if (repeat.kind === 'recurring') {
        await unwrap<unknown>(api().POST('/api/recurring-transactions', { body: toRecurring(body, currency, repeat) }))
      }
      return created
    },
    onSuccess: () => {
      invalidateFinancialQueries(queryClient, ws)
      void queryClient.invalidateQueries({ queryKey: [ws, 'recurring'] })
    },
  })
}

export function useCreateTransfer() {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: components['schemas']['TransferCreate']) =>
      unwrap<components['schemas']['TransferRead']>(api().POST('/api/transactions/transfer', { body })),
    onSuccess: () => invalidateFinancialQueries(queryClient, ws),
  })
}
