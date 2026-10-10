import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { useProviders, type Provider } from '@/features/connections/hooks'

const ROUTES = {
  token: '/connections/simplefin',
  widget: '/connections/pluggy',
  oauth: '/connections/enable-banking',
} as const

export default function NewConnectionScreen() {
  const { t } = useTranslation()
  const providers = useProviders()

  if (providers.isPending) return <Loading />
  if (providers.isError) return <ErrorState error={providers.error} onRetry={() => providers.refetch()} />

  const open = (provider: Provider) => {
    const route = ROUTES[provider.flow_type as keyof typeof ROUTES]
    if (route) router.replace(route)
  }

  return (
    <Screen>
      <Text tone="muted">{t('connections.chooseProvider')}</Text>
      <Card style={styles.list}>
        {providers.data.map((provider) => (
          <ListRow
            key={provider.name}
            title={provider.display_name}
            subtitle={
              provider.configured
                ? t(`connections.providers.${provider.name}`, { defaultValue: provider.description })
                : t('connections.notConfigured')
            }
            subtitleLines={3}
            onPress={provider.configured ? () => open(provider) : undefined}
            showChevron={provider.configured}
          />
        ))}
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden' },
})
