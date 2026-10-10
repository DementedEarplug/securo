import { useTranslation } from 'react-i18next'
import { Alert, StyleSheet } from 'react-native'

import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { useDevices, useRevokeDevice } from '@/features/session/devices'
import { useDisplayFormat } from '@/features/session/hooks'
import { errorMessage } from '@/lib/errors'

export default function SessionsScreen() {
  const { t } = useTranslation()
  const { dateLocale } = useDisplayFormat()
  const devices = useDevices()
  const revoke = useRevokeDevice()

  if (devices.isPending) return <Loading />
  if (devices.isError) return <ErrorState error={devices.error} onRetry={() => devices.refetch()} />

  const signedInOn = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium' }).format(new Date(iso))
    } catch {
      return iso.slice(0, 10)
    }
  }

  const confirmRevoke = (id: string, name: string) =>
    Alert.alert(t('settings.revokeTitle'), t('settings.revokeBody', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.revoke'),
        style: 'destructive',
        onPress: async () => {
          try {
            await revoke.mutateAsync(id)
          } catch (e) {
            Alert.alert(t('common.errorTitle'), errorMessage(e, t))
          }
        },
      },
    ])

  return (
    <Screen onRefresh={() => devices.refetch()} refreshing={devices.isRefetching}>
      <Text tone="muted">{t('settings.devicesIntro')}</Text>
      {devices.data.length === 0 ? (
        <EmptyState title={t('settings.devicesEmpty')} />
      ) : (
        <Card style={styles.list}>
          {devices.data.map((device) => {
            const name = device.device_name ?? t('settings.unknownDevice')
            return (
              <ListRow
                key={device.id}
                title={name}
                subtitle={t('settings.lastActive', { date: signedInOn(device.last_used_at ?? device.created_at) })}
                onPress={() => confirmRevoke(device.id, name)}
                accessibilityLabel={`${name}, ${t('settings.revoke')}`}
                trailing={<Text tone="destructive" variant="label">{t('settings.revoke')}</Text>}
              />
            )
          })}
        </Card>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden' },
})
