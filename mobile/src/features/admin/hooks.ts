import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { api, unwrap, unwrapAs } from '@/api/client'
import { ApiError } from '@/api/errors'
import type { AdminUser, AdminUserCreate, AdminUserUpdate, SettingKey, TimezoneSetting } from './model'

// Admin data is instance-wide, not per workspace, so the keys aren't scoped.
const USERS = ['admin', 'users'] as const
const SETTINGS = ['admin', 'settings'] as const

export function useAdminUsers(search: string) {
  const q = search.trim()
  return useQuery({
    queryKey: [...USERS, 'list', q],
    queryFn: () =>
      unwrap(api().GET('/api/admin/users', { params: { query: { search: q || undefined, limit: 100 } } })),
    placeholderData: (previous) => previous,
  })
}

export function useAdminUser(id: string) {
  return useQuery({
    queryKey: [...USERS, 'detail', id],
    queryFn: () => unwrap<AdminUser>(api().GET('/api/admin/users/{user_id}', { params: { path: { user_id: id } } })),
    enabled: Boolean(id),
  })
}

function useUserMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: USERS }),
  })
}

export function useCreateUser() {
  return useUserMutation((body: AdminUserCreate) => unwrap<AdminUser>(api().POST('/api/admin/users', { body })))
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: AdminUserUpdate) =>
      unwrap<AdminUser>(api().PATCH('/api/admin/users/{user_id}', { params: { path: { user_id: id } }, body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS })
      // Editing yourself (e.g. your email) shows up elsewhere in the app.
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useDeleteUser() {
  return useUserMutation((id: string) =>
    unwrap(api().DELETE('/api/admin/users/{user_id}', { params: { path: { user_id: id } } })),
  )
}

/** A saved setting's value, or `null` when it was never saved (the server answers 404). */
export function useAdminSetting(key: SettingKey) {
  return useQuery({
    queryKey: [...SETTINGS, key],
    queryFn: async () => {
      try {
        return (await unwrap(api().GET('/api/admin/settings/{key}', { params: { path: { key } } }))).value
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
    retry: false,
  })
}

/** Whether sign-up is open, after the environment-variable fallback. */
export function useRegistrationStatus() {
  return useQuery({
    queryKey: [...SETTINGS, 'registration-status'],
    queryFn: () => unwrapAs<{ enabled: boolean }>(api().GET('/api/admin/registration-status')),
  })
}

/**
 * Whether this server lets people sign in with a password. In SSO-only mode
 * admins can't create users or reset passwords here. Like the web, a failed
 * lookup falls back to showing the controls; the server still enforces it.
 */
export function useLocalAuthEnabled(): boolean {
  const config = useQuery({
    queryKey: ['admin', 'oidc-config'],
    queryFn: () => unwrapAs<{ local_auth_enabled?: boolean }>(api().GET('/api/auth/oidc/config')),
    staleTime: 60_000,
    retry: false,
  })
  return config.data?.local_auth_enabled ?? config.isError
}

export function useTimezoneSetting() {
  return useQuery({
    queryKey: [...SETTINGS, 'timezone-detail'],
    queryFn: () => unwrap<TimezoneSetting>(api().GET('/api/admin/timezone')),
  })
}

/** Other screens that read a setting, refreshed once it changes. */
function refreshDependents(queryClient: QueryClient, key: SettingKey) {
  void queryClient.invalidateQueries({ queryKey: SETTINGS })
  if (key === 'number_format') void queryClient.invalidateQueries({ queryKey: ['settings', 'number-format'] })
  if (key === 'date_format') void queryClient.invalidateQueries({ queryKey: ['settings', 'date-format'] })
  // Accounting mode re-buckets card spending in reports and budgets; the
  // timezone moves "today". Both touch most screens, so refresh everything.
  if (key === 'credit_card_accounting_mode' || key === 'timezone') void queryClient.invalidateQueries()
}

/** Save a setting; `null` forgets it so the server default applies again. */
export function useSaveSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, value }: { key: SettingKey; value: string | null }) => {
      if (value === null) {
        await unwrap(api().DELETE('/api/admin/settings/{key}', { params: { path: { key } } }))
      } else {
        await unwrap(api().PATCH('/api/admin/settings/{key}', { params: { path: { key } }, body: { value } }))
      }
      return key
    },
    onSuccess: (key) => refreshDependents(queryClient, key),
  })
}
