import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap, unwrapAs } from '@/api/client'
import type { components } from '@/api/schema'
import { invalidateFinancialQueries } from '@/features/transactions/hooks'
import { useWorkspaceKey } from '@/features/session/hooks'

type Schemas = components['schemas']
export type Connection = Schemas['BankConnectionRead']
export type ConnectionSettings = Schemas['ConnectionSettingsUpdate']
export type Institution = Schemas['InstitutionRead']

/** `/connections/providers` has no response model on the backend. */
export interface Provider {
  name: 'pluggy' | 'enable_banking' | 'simplefin' | string
  display_name: string
  description: string
  flow_type: 'widget' | 'oauth' | 'token' | string
  requires_institution_select: boolean
  supports_asset_sync: boolean
  configured: boolean
}

export type PayeeSource = 'auto' | 'merchant' | 'payment_data' | 'description' | 'none'

/** Connection settings the web reads from the free-form `settings` object. */
export interface ConnectionSettingValues {
  payee_source?: PayeeSource
  import_pending?: boolean
  sync_assets?: boolean
  /** Linked with account selection and nothing imported until accounts are chosen. */
  awaiting_account_selection?: boolean
  excluded_accounts?: string[]
}

export function connectionSettings(connection: Connection): ConnectionSettingValues {
  return (connection.settings ?? {}) as ConnectionSettingValues
}

export function connectionName(connection: Connection): string {
  return connection.display_name || connection.institution_name
}

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: () => unwrapAs<{ providers: Provider[] }>(api().GET('/api/connections/providers')),
    staleTime: 10 * 60 * 1000,
    select: (data) => data.providers,
  })
}

export function useConnections() {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'connections'],
    queryFn: () => unwrap<Connection[]>(api().GET('/api/connections')),
  })
}

export function useInstitutions(provider: string, country: string | null) {
  return useQuery({
    queryKey: ['institutions', provider, country ?? ''],
    queryFn: () =>
      unwrap<Schemas['InstitutionListResponse']>(
        api().GET('/api/connections/{provider}/institutions', {
          params: { path: { provider }, query: { country: country ?? undefined } },
        }),
      ),
    staleTime: 60 * 60 * 1000,
  })
}

function useInvalidateBanking() {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return () => {
    invalidateFinancialQueries(queryClient, ws)
    for (const key of ['connections', 'assets', 'asset-groups']) {
      void queryClient.invalidateQueries({ queryKey: [ws, key] })
    }
  }
}

export interface SyncResult extends Connection {
  merged_count?: number
}

/**
 * Pull new data from the bank now. Synchronous on the server: it can take a
 * minute or more (Pluggy asks the bank to refresh and waits for it).
 */
export function useSyncConnection() {
  const invalidate = useInvalidateBanking()
  return useMutation({
    mutationFn: (id: string) =>
      unwrapAs<SyncResult>(api().POST('/api/connections/{connection_id}/sync', { params: { path: { connection_id: id } } })),
    // A failed sync can change the connection's status, so refresh either way.
    onSettled: invalidate,
  })
}

export function useUpdateConnectionSettings(id: string) {
  const invalidate = useInvalidateBanking()
  return useMutation({
    mutationFn: (body: ConnectionSettings) =>
      unwrap<Connection>(
        api().PATCH('/api/connections/{connection_id}/settings', { params: { path: { connection_id: id } }, body }),
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteConnection() {
  const invalidate = useInvalidateBanking()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap<unknown>(api().DELETE('/api/connections/{connection_id}', { params: { path: { connection_id: id } } })),
    onSuccess: invalidate,
  })
}

export function useConnectionAccounts(id: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'connections', id, 'accounts'],
    queryFn: () =>
      unwrap<Schemas['ConnectionAccountsRead']>(
        api().GET('/api/connections/{connection_id}/accounts', { params: { path: { connection_id: id } } }),
      ),
  })
}

/**
 * Save which accounts a connection imports. Synchronous on the server, which
 * imports newly chosen accounts with their full history before answering.
 */
export function useUpdateConnectionAccounts(id: string) {
  const invalidate = useInvalidateBanking()
  return useMutation({
    mutationFn: (body: Schemas['ConnectionAccountsUpdate']) =>
      unwrap<Connection>(
        api().PUT('/api/connections/{connection_id}/accounts', { params: { path: { connection_id: id } }, body }),
      ),
    onSettled: invalidate,
  })
}

/**
 * Finish linking (or re-linking) a bank: the provider's code, Pluggy's item id
 * or a SimpleFIN setup token. Synchronous on the server, which imports the
 * full history before answering.
 */
export function useCompleteLink() {
  const invalidate = useInvalidateBanking()
  return useMutation({
    mutationFn: (body: Schemas['OAuthCallbackRequest']) =>
      unwrap<Connection>(api().POST('/api/connections/oauth/callback', { body })),
    onSuccess: invalidate,
  })
}

export async function fetchConnectToken(): Promise<string> {
  const body = await unwrap<Schemas['ConnectTokenResponse']>(
    api().POST('/api/connections/connect-token', { body: { provider: 'pluggy' } }),
  )
  return body.access_token
}

export async function fetchReconnectToken(id: string): Promise<string> {
  const body = await unwrap<Schemas['ReconnectTokenResponse']>(
    api().POST('/api/connections/{connection_id}/reconnect-token', { params: { path: { connection_id: id } } }),
  )
  return body.access_token
}

export async function fetchOAuthUrl(flowParams: Record<string, unknown>): Promise<string> {
  const body = await unwrap<Schemas['OAuthUrlResponse']>(
    api().POST('/api/connections/oauth/url', { body: { provider: 'enable_banking', flow_params: flowParams } }),
  )
  return body.url
}

export async function fetchReauthUrl(id: string): Promise<string> {
  const body = await unwrap<Schemas['ReauthUrlResponse']>(
    api().POST('/api/connections/{connection_id}/oauth/reauth-url', { params: { path: { connection_id: id } } }),
  )
  return body.url
}
