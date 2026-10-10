import { Platform } from 'react-native'

import type { TokenResponse } from '@/api/types'
import * as storage from './storage'

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn'

export interface SessionState {
  status: SessionStatus
  /** Origin of the Securo server, e.g. `https://securo.example.com` (no `/api`). */
  serverUrl: string | null
  accessToken: string | null
  refreshToken: string | null
  /** Sent as `X-Workspace-Id`; null lets the backend pick the default workspace. */
  workspaceId: string | null
}

type Storage = Pick<
  typeof storage,
  'loadSession' | 'saveTokens' | 'saveServerUrl' | 'saveWorkspaceId'
>

const INITIAL: SessionState = {
  status: 'loading',
  serverUrl: null,
  accessToken: null,
  refreshToken: null,
  workspaceId: null,
}

/** Label the server shows for this phone in the signed-in devices list. */
export function deviceName(): string {
  const constants = Platform.constants as { Brand?: string; Model?: string }
  const name = [constants.Brand, constants.Model].filter(Boolean).join(' ')
  return name || `Android ${Platform.Version}`
}

/**
 * The signed-in state of the app, persisted across launches.
 *
 * A plain store rather than React state so the HTTP layer can read the current
 * token and refresh it without going through a component tree.
 */
export class SessionStore {
  private state: SessionState = INITIAL
  private listeners = new Set<() => void>()
  private refreshing: Promise<boolean> | null = null

  constructor(
    private readonly store: Storage = storage,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  getState = (): SessionState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  }

  async hydrate(): Promise<void> {
    const saved = await this.store.loadSession()
    // An access token alone is enough to start; the refresh token keeps it alive.
    const signedIn = Boolean(saved.serverUrl && (saved.accessToken || saved.refreshToken))
    this.set({ ...saved, status: signedIn ? 'signedIn' : 'signedOut' })
  }

  async setServerUrl(serverUrl: string): Promise<void> {
    await this.store.saveServerUrl(serverUrl)
    this.set({ serverUrl })
  }

  async signIn(tokens: TokenResponse): Promise<void> {
    const refreshToken = tokens.refresh_token ?? null
    await this.store.saveTokens(tokens.access_token, refreshToken)
    this.set({ status: 'signedIn', accessToken: tokens.access_token, refreshToken })
  }

  async setWorkspaceId(workspaceId: string | null): Promise<void> {
    await this.store.saveWorkspaceId(workspaceId)
    this.set({ workspaceId })
  }

  /**
   * Forget the credentials on this device. When `revoke` is set the refresh
   * token is also revoked on the server, so a copy of it is useless; that is
   * best effort, since signing out must work offline too.
   */
  async signOut({ revoke = false }: { revoke?: boolean } = {}): Promise<void> {
    const { serverUrl, refreshToken } = this.state
    if (revoke && serverUrl && refreshToken) {
      try {
        await this.fetchImpl(`${serverUrl}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
      } catch {
        // Offline: the token still expires on its own.
      }
    }
    await this.store.saveTokens(null, null)
    await this.store.saveWorkspaceId(null)
    this.set({ status: 'signedOut', accessToken: null, refreshToken: null, workspaceId: null })
  }

  /**
   * Exchange the refresh token for a new access token. Concurrent callers share
   * one request, because the server rotates the token on every use and treats
   * a second use of the old one as theft.
   *
   * Resolves false when the session is over (the user must sign in again) and
   * also when the server could not be reached; only the former signs out.
   */
  refreshAccessToken(): Promise<boolean> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  private async doRefresh(): Promise<boolean> {
    const { serverUrl, refreshToken } = this.state
    if (!serverUrl || !refreshToken) return false

    let response: Response
    try {
      response = await this.fetchImpl(`${serverUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Name': deviceName() },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
    } catch {
      return false
    }

    if (response.status === 401) {
      await this.signOut()
      return false
    }
    if (!response.ok) return false

    await this.signIn((await response.json()) as TokenResponse)
    return true
  }
}

export const session = new SessionStore()
