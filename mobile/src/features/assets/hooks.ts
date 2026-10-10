import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { api, unwrap, unwrapAs } from '@/api/client'
import type { components } from '@/api/schema'
import { useWorkspaceKey } from '@/features/session/hooks'
import type { Asset, AssetGroup, AssetTransaction, AssetValue, MarketMatch, MarketQuote, TxRequest } from './model'

type Schemas = components['schemas']
export type { Asset, AssetGroup, AssetTransaction, AssetValue } from './model'

/** `GET /assets/portfolio-trend`: one row per date, one column per asset id, in the primary currency. */
export interface PortfolioTrend {
  assets: { id: string; name: string; type: string; group_id: string | null }[]
  trend: ({ date: string; _total: number } & Record<string, number | string>)[]
  total: number
}

// Every per-asset query lives under [ws, 'assets', ...] so one invalidation
// refreshes the list, details, ledgers, values and the portfolio chart.
export function useAssets({ includeArchived = false }: { includeArchived?: boolean } = {}) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'assets', { includeArchived }],
    queryFn: () => unwrap<Asset[]>(api().GET('/api/assets', { params: { query: { include_archived: includeArchived } } })),
  })
}

export function useAsset(id: string | undefined) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'assets', 'detail', id],
    queryFn: () => unwrap<Asset>(api().GET('/api/assets/{asset_id}', { params: { path: { asset_id: id! } } })),
    enabled: Boolean(id),
  })
}

export function useAssetGroups() {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'asset-groups'],
    queryFn: () => unwrap<AssetGroup[]>(api().GET('/api/asset-groups')),
  })
}

export function usePortfolioTrend() {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'assets', 'portfolio-trend'],
    queryFn: () => unwrapAs<PortfolioTrend>(api().GET('/api/assets/portfolio-trend')),
  })
}

export function useAssetValues(id: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'assets', 'values', id],
    queryFn: () => unwrap<AssetValue[]>(api().GET('/api/assets/{asset_id}/values', { params: { path: { asset_id: id } } })),
  })
}

export function useAssetValueTrend(id: string, months = 12) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'assets', 'trend', id, months],
    queryFn: () =>
      unwrapAs<{ date: string; amount: number }[]>(
        api().GET('/api/assets/{asset_id}/value-trend', { params: { path: { asset_id: id }, query: { months } } }),
      ),
  })
}

/** One holding's buy/sell ledger, or the whole workspace's when `id` is omitted. */
export function useAssetTransactions(id?: string, { enabled = true }: { enabled?: boolean } = {}) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'assets', 'transactions', id ?? 'all'],
    queryFn: () =>
      id
        ? unwrap<AssetTransaction[]>(api().GET('/api/assets/{asset_id}/transactions', { params: { path: { asset_id: id } } }))
        : unwrap<AssetTransaction[]>(api().GET('/api/assets/transactions')),
    enabled,
  })
}

export function searchMarket(q: string): Promise<MarketMatch[]> {
  return unwrap<MarketMatch[]>(api().GET('/api/assets/market/search', { params: { query: { q, limit: 10 } } }))
}

export function fetchQuote(symbol: string): Promise<MarketQuote> {
  return unwrap<MarketQuote>(api().GET('/api/assets/market/quote', { params: { query: { symbol } } }))
}

/** Ticker search (pass a debounced query); idle until it has a character. */
export function useMarketSearch(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: ['market-search', q],
    queryFn: () => searchMarket(q),
    enabled: q.length > 0,
    staleTime: 60_000,
    retry: false,
  })
}

/** Asset changes move balances, net worth and asset-tracked goals too. */
function useAssetMutation<A, R>(fn: (args: A) => Promise<R>) {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of ['assets', 'asset-groups', 'dashboard', 'goals', 'reports']) {
        void queryClient.invalidateQueries({ queryKey: [ws, key] })
      }
    },
  })
}

type AssetBody = Partial<Schemas['AssetCreate'] & Schemas['AssetUpdate']>

export function useSaveAsset() {
  return useAssetMutation(({ id, body, regenerateGrowth }: { id?: string; body: AssetBody; regenerateGrowth?: boolean }) =>
    id
      ? unwrap<Asset>(
          api().PATCH('/api/assets/{asset_id}', {
            params: { path: { asset_id: id }, query: regenerateGrowth ? { regenerate_growth: true } : {} },
            body,
          }),
        )
      : unwrap<Asset>(api().POST('/api/assets', { body: body as Schemas['AssetCreate'] })),
  )
}

export function useDeleteAsset() {
  return useAssetMutation((id: string) => unwrap<unknown>(api().DELETE('/api/assets/{asset_id}', { params: { path: { asset_id: id } } })))
}

export function useRefreshPrice() {
  return useAssetMutation((id: string) =>
    unwrap<Asset>(api().POST('/api/assets/{asset_id}/refresh-price', { params: { path: { asset_id: id } } })),
  )
}

export function useAddValue(assetId: string) {
  return useAssetMutation((body: Schemas['AssetValueCreate']) =>
    unwrap<AssetValue>(api().POST('/api/assets/{asset_id}/values', { params: { path: { asset_id: assetId } }, body })),
  )
}

export function useDeleteValue() {
  return useAssetMutation((valueId: string) =>
    unwrap<unknown>(api().DELETE('/api/assets/values/{value_id}', { params: { path: { value_id: valueId } } })),
  )
}

/** Save a trade: edit an entry, buy a new ticker, or add to a holding. Resolves to the affected holding. */
export function useSaveTransaction() {
  return useAssetMutation((request: TxRequest) => {
    switch (request.type) {
      case 'update':
        return unwrap<Asset>(
          api().PATCH('/api/assets/transactions/{tx_id}', { params: { path: { tx_id: request.id } }, body: request.body }),
        )
      case 'buy':
        return unwrap<Asset>(api().POST('/api/assets/buy', { body: request.body }))
      case 'add':
        return unwrap<Asset>(
          api().POST('/api/assets/{asset_id}/transactions', {
            params: { path: { asset_id: request.assetId } },
            body: request.body,
          }),
        )
    }
  })
}

export function useDeleteTransaction() {
  return useAssetMutation((txId: string) =>
    unwrap<Asset>(api().DELETE('/api/assets/transactions/{tx_id}', { params: { path: { tx_id: txId } } })),
  )
}

export function useSaveAssetGroup() {
  return useAssetMutation(({ id, body }: { id?: string; body: Schemas['AssetGroupUpdate'] }) =>
    id
      ? unwrap<AssetGroup>(api().PATCH('/api/asset-groups/{group_id}', { params: { path: { group_id: id } }, body }))
      : unwrap<AssetGroup>(api().POST('/api/asset-groups', { body: { icon: 'wallet', ...body } as Schemas['AssetGroupCreate'] })),
  )
}

export function useDeleteAssetGroup() {
  return useAssetMutation((id: string) =>
    unwrap<unknown>(api().DELETE('/api/asset-groups/{group_id}', { params: { path: { group_id: id } } })),
  )
}

/** `value`, once it has stopped changing for `delay` ms. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(handle)
  }, [value, delay])
  return debounced
}
