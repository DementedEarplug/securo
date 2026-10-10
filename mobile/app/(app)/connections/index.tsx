import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Image, StyleSheet, View } from 'react-native'

import { Card } from '@/components/Card'
import { Fab } from '@/components/Fab'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { ConnectionStatus } from '@/features/connections/ConnectionStatus'
import { connectionName, useConnections } from '@/features/connections/hooks'
import { useCanWrite } from '@/features/session/hooks'
import Landmark from 'lucide-react-native/icons/landmark'
import { useColors } from '@/theme'

export default function ConnectionsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const canWrite = useCanWrite()
  const connections = useConnections()

  if (connections.isPending) return <Loading />
  if (connections.isError) return <ErrorState error={connections.error} onRetry={() => connections.refetch()} />

  return (
    <View style={styles.root}>
      <Screen onRefresh={() => connections.refetch()} refreshing={connections.isRefetching}>
        {connections.data.length === 0 ? (
          <EmptyState title={t('connections.emptyTitle')} body={t('connections.emptyBody')} />
        ) : (
          <Card style={styles.list}>
            {connections.data.map((connection) => (
              <ListRow
                key={connection.id}
                title={connectionName(connection)}
                leading={
                  connection.logo_url && (connection.institutions?.length ?? 0) <= 1 ? (
                    <Image source={{ uri: connection.logo_url }} style={styles.logo} accessibilityIgnoresInvertColors />
                  ) : (
                    <Landmark size={22} color={colors.primary} />
                  )
                }
                trailing={<ConnectionStatus connection={connection} />}
                onPress={() => router.push({ pathname: '/connections/[id]', params: { id: connection.id } })}
                showChevron
              />
            ))}
          </Card>
        )}
      </Screen>
      {canWrite ? <Fab label={t('connections.add')} onPress={() => router.push('/connections/new')} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 0, overflow: 'hidden' },
  logo: { width: 28, height: 28, borderRadius: 6 },
})
