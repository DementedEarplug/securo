import FileUp from 'lucide-react-native/icons/file-up'
import History from 'lucide-react-native/icons/rotate-ccw-clock'
import Landmark from 'lucide-react-native/icons/landmark'
import Tags from 'lucide-react-native/icons/tags'
import Wand from 'lucide-react-native/icons/wand-sparkles'
import Store from 'lucide-react-native/icons/store'
import Repeat from 'lucide-react-native/icons/repeat'
import Users from 'lucide-react-native/icons/users'
import Target from 'lucide-react-native/icons/target'
import Settings from 'lucide-react-native/icons/settings'
import Bot from 'lucide-react-native/icons/bot'
import Gem from 'lucide-react-native/icons/gem'
import ReceiptText from 'lucide-react-native/icons/receipt-text'
import HardDriveDownload from 'lucide-react-native/icons/hard-drive-download'
import ShieldCheck from 'lucide-react-native/icons/shield-check'

import type { MoreSection } from './items'

/** Everything reachable from the More tab, grouped as on the web sidebar. */
export const MORE_SECTIONS: MoreSection[] = [
  {
    key: 'banking',
    items: [
      { key: 'connections', href: '/connections', icon: Landmark },
      { key: 'import', href: '/import', icon: FileUp },
      { key: 'importLogs', href: '/import/history', icon: History },
    ],
  },
  {
    key: 'organize',
    items: [
      { key: 'categories', href: '/categories', icon: Tags },
      { key: 'rules', href: '/rules', icon: Wand },
      { key: 'payees', href: '/payees', icon: Store },
    ],
  },
  {
    key: 'plan',
    items: [
      { key: 'recurring', href: '/recurring', icon: Repeat },
      { key: 'goals', href: '/goals', icon: Target },
      { key: 'groups', href: '/groups', icon: Users },
    ],
  },
  {
    key: 'wealth',
    items: [
      { key: 'assets', href: '/assets', icon: Gem },
      // Business workspaces only: the server answers 404 elsewhere.
      { key: 'invoices', href: '/invoices', icon: ReceiptText, visible: (ctx) => ctx.modules.includes('invoices') },
    ],
  },
  { key: 'data', items: [{ key: 'export', href: '/export', icon: HardDriveDownload }] },
  { key: 'admin', items: [{ key: 'admin', href: '/admin', icon: ShieldCheck, visible: (ctx) => ctx.isSuperuser }] },
  {
    key: 'app',
    items: [
      { key: 'agents', href: '/agents', icon: Bot, visible: (ctx) => ctx.agentsEnabled },
      { key: 'settings', href: '/settings', icon: Settings },
    ],
  },
]
