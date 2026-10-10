import type { TFunction } from 'i18next'
import { Alert, Linking } from 'react-native'

import { ApiError } from '@/api/errors'
import { errorMessage } from '@/lib/errors'

/**
 * Explain a failed link. A provider that returned no accounts sends a link to
 * its portal (Enable Banking's free tier needs accounts pre-linked there).
 */
export function alertLinkError(error: unknown, t: TFunction) {
  const helpUrl = error instanceof ApiError ? error.helpUrl : null
  Alert.alert(t('connections.linkFailedTitle'), errorMessage(error, t), [
    ...(helpUrl ? [{ text: t('connections.openHelp'), onPress: () => void Linking.openURL(helpUrl) }] : []),
    { text: t('common.close'), style: 'cancel' as const },
  ])
}
