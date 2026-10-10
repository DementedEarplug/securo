import { useTranslation } from 'react-i18next'

import { Text } from '@/components/Text'
import { formatRelative } from '@/lib/dates'
import type { Connection } from './hooks'

/** "Synced 3 hours ago", or the problem when the connection needs attention. */
export function ConnectionStatus({ connection }: { connection: Connection }) {
  const { t, i18n } = useTranslation()
  if (connection.status !== 'active') {
    return (
      <Text variant="caption" tone="destructive">
        {t(`connections.status.${connection.status}`, { defaultValue: connection.status })}
      </Text>
    )
  }
  return (
    <Text variant="caption" tone="muted">
      {connection.last_sync_at
        ? t('connections.syncedAgo', { when: formatRelative(connection.last_sync_at, i18n.language) })
        : t('connections.neverSynced')}
    </Text>
  )
}
