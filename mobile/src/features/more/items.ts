import type { Href } from 'expo-router'
import type { LucideIcon } from 'lucide-react-native'

export interface MoreContext {
  isSuperuser: boolean
  agentsEnabled: boolean
  /** The current workspace's `enabled_modules` (e.g. `invoices` on business workspaces). */
  modules: string[]
}

export interface MoreItem {
  key: string
  href: Href
  icon: LucideIcon
  /** Only shown when this returns true (feature flags, admin-only pages). */
  visible?: (ctx: MoreContext) => boolean
}

export interface MoreSection {
  key: string
  items: MoreItem[]
}
