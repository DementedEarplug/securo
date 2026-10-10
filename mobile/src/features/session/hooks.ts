import { useQuery } from '@tanstack/react-query'
import { useMemo, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { api, unwrap, unwrapAs } from '@/api/client'
import { READ_ONLY_ROLES, type User, type Workspace } from '@/api/types'
import { session, type SessionState } from '@/auth/session'
import {
  resolveDateLocale,
  resolveDisplayLocale,
  type DateFormat,
  type NumberFormat,
} from '@/lib/format'

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState)
}

/** Query keys are scoped to the workspace so switching never shows stale data. */
export function useWorkspaceKey(): string {
  return useSession().workspaceId ?? 'default'
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => unwrap<User>(api().GET('/api/users/me')),
  })
}

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => unwrap<Workspace[]>(api().GET('/api/workspaces')),
  })
}

/** The workspace requests go to: the stored choice, else the server default. */
export function useCurrentWorkspace(): Workspace | undefined {
  const { workspaceId } = useSession()
  const workspaces = useWorkspaces().data
  const current = useQuery({
    queryKey: ['workspaces', 'current', workspaceId ?? 'default'],
    queryFn: () => unwrap<Workspace>(api().GET('/api/workspaces/current')),
    enabled: !workspaceId,
  }).data
  return workspaceId ? workspaces?.find((w) => w.id === workspaceId) : current
}

export function useCanWrite(): boolean {
  const role = useCurrentWorkspace()?.role
  return !role || !READ_ONLY_ROLES.has(role)
}

interface FormatSetting<T> {
  format: T
}

export interface DisplayFormat {
  /** Locale whose separators match the admin number format. */
  locale: string
  /** Locale for dates: the UI language with the admin date order. */
  dateLocale: string
  /** The user's display currency (`preferences.currency_display`). */
  currency: string
}

/**
 * How this server wants numbers and dates written. Instance-wide settings
 * (Admin → number/date format) combined with the user's display currency,
 * resolved exactly as the web app does.
 */
export function useDisplayFormat(): DisplayFormat {
  const { i18n } = useTranslation()
  const me = useMe().data
  const numberFormat = useQuery({
    queryKey: ['settings', 'number-format'],
    queryFn: () => unwrapAs<FormatSetting<NumberFormat>>(api().GET('/api/admin/number-format')),
    staleTime: Infinity,
  }).data?.format
  const dateFormat = useQuery({
    queryKey: ['settings', 'date-format'],
    queryFn: () => unwrapAs<FormatSetting<DateFormat>>(api().GET('/api/admin/date-format')),
    staleTime: Infinity,
  }).data?.format

  const currency = (me?.preferences?.currency_display as string | undefined) ?? 'USD'
  const language = i18n.language
  return useMemo(
    () => ({
      locale: resolveDisplayLocale(numberFormat, currency, language === 'pt-BR' ? 'pt-BR' : 'en-US'),
      dateLocale: resolveDateLocale(dateFormat, numberFormat, currency, language),
      currency,
    }),
    [numberFormat, dateFormat, currency, language],
  )
}
