import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { errorMessage } from '@/lib/errors'
import { spacing, useColors } from '@/theme'
import { Button } from './Button'
import { Text } from './Text'

export function Loading() {
  const colors = useColors()
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  )
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.center}>
      <Text variant="heading" style={styles.text}>
        {title}
      </Text>
      {body ? (
        <Text tone="muted" style={styles.text}>
          {body}
        </Text>
      ) : null}
    </View>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <View style={styles.center}>
      <Text variant="heading" style={styles.text}>
        {t('common.errorTitle')}
      </Text>
      <Text tone="muted" style={styles.text}>
        {errorMessage(error, t)}
      </Text>
      {onRetry ? <Button label={t('common.retry')} onPress={onRetry} variant="secondary" /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  text: { textAlign: 'center' },
})
