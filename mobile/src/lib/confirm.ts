import { Alert } from 'react-native'

import i18n from '@/i18n'

/** Ask before something destructive; resolves true only on the destructive button. */
export function confirmDestructive(title: string, body: string, action = i18n.t('common.delete')): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      title,
      body,
      [
        { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: action, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  )
}

export function showError(message: string) {
  Alert.alert(i18n.t('common.errorTitle'), message)
}
