import CircleCheck from 'lucide-react-native/icons/circle-check'
import CircleX from 'lucide-react-native/icons/circle-x'
import Plug from 'lucide-react-native/icons/plug'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Fab } from '@/components/Fab'
import { Screen } from '@/components/Screen'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { useDeleteConnection, useLlmConnections, useTestConnection } from '@/features/agents/hooks'
import { CONNECTION_KINDS } from '@/features/agents/manage'
import type { LlmConnection } from '@/features/agents/types'
import { useCanWrite } from '@/features/session/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'
import { spacing, useColors } from '@/theme'

/** The LLM endpoints assistants talk to (OpenAI, Anthropic, Ollama, …). */
export default function ConnectionsScreen() {
  const { t } = useTranslation()
  const canWrite = useCanWrite()
  const connections = useLlmConnections()

  if (connections.isPending) return <Loading />
  if (connections.isError) return <ErrorState error={connections.error} onRetry={() => connections.refetch()} />
  const add = () => router.push('/agents/connection-form')

  return (
    <View style={styles.root}>
      <Screen onRefresh={() => connections.refetch()} refreshing={connections.isRefetching}>
        <Text tone="muted">{t('agents.connections.subtitle')}</Text>
        {connections.data.length === 0 ? (
          <>
            <EmptyState title={t('agents.connections.emptyTitle')} body={t('agents.connections.emptyBody')} />
            {canWrite ? <Button label={t('agents.connections.add')} onPress={add} /> : null}
          </>
        ) : (
          connections.data.map((connection) => <ConnectionCard key={connection.id} connection={connection} canWrite={canWrite} />)
        )}
        <View style={styles.fabSpace} />
      </Screen>
      {canWrite && connections.data.length ? <Fab label={t('agents.connections.add')} onPress={add} /> : null}
    </View>
  )
}

function ConnectionCard({ connection, canWrite }: { connection: LlmConnection; canWrite: boolean }) {
  const { t } = useTranslation()
  const colors = useColors()
  const test = useTestConnection()
  const remove = useDeleteConnection()
  const result = test.data

  const confirmDelete = async () => {
    if (!(await confirmDestructive(t('agents.connections.deleteTitle'), t('agents.connections.deleteConfirm', { name: connection.name })))) return
    remove.mutate(connection.id, { onError: (e) => showError(errorMessage(e, t)) })
  }

  return (
    <Card>
      <View style={styles.header}>
        <Plug size={20} color={colors.mutedForeground} />
        <View style={styles.flex}>
          <Text variant="label">
            {[connection.name, connection.is_default ? t('agents.connections.default') : null].filter(Boolean).join(' · ')}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {[
              CONNECTION_KINDS[connection.kind]?.label ?? connection.kind,
              connection.base_url || t('agents.connections.providerDefaultEndpoint'),
              connection.default_model || t('agents.connections.noDefaultModel'),
            ].join(' · ')}
          </Text>
        </View>
      </View>
      {result ? (
        <View style={styles.header} accessibilityLiveRegion="polite">
          {result.ok ? <CircleCheck size={16} color={colors.income} /> : <CircleX size={16} color={colors.destructive} />}
          <Text variant="caption" tone={result.ok ? 'income' : 'destructive'} style={styles.flex}>
            {result.detail}
          </Text>
        </View>
      ) : test.isError ? (
        <Text variant="caption" tone="destructive">
          {errorMessage(test.error, t)}
        </Text>
      ) : null}
      {canWrite ? (
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button label={t('agents.connections.test')} variant="secondary" onPress={() => test.mutate(connection.id)} loading={test.isPending} />
          </View>
          <View style={styles.flex}>
            <Button
              label={t('common.edit')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/agents/connection-form', params: { id: connection.id } })}
            />
          </View>
          <View style={styles.flex}>
            <Button label={t('common.delete')} variant="ghost" onPress={() => void confirmDelete()} loading={remove.isPending} />
          </View>
        </View>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fabSpace: { height: 72 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
})
