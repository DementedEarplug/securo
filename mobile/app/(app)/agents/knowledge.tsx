import CircleAlert from 'lucide-react-native/icons/circle-alert'
import CircleCheck from 'lucide-react-native/icons/circle-check'
import Pin from 'lucide-react-native/icons/pin'
import PinOff from 'lucide-react-native/icons/pin-off'
import Trash from 'lucide-react-native/icons/trash'
import * as DocumentPicker from 'expo-document-picker'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Screen } from '@/components/Screen'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { useDeleteKnowledge, useKnowledge, usePinKnowledge, useUploadKnowledge } from '@/features/agents/hooks'
import { isKnowledgeFile, KNOWLEDGE_EXTENSIONS } from '@/features/agents/manage'
import type { KnowledgeDoc } from '@/features/agents/types'
import { useCanWrite } from '@/features/session/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'
import { spacing, useColors } from '@/theme'

/** Documents an assistant can search when answering (PDF, Markdown, text). */
export default function KnowledgeScreen() {
  const { t } = useTranslation()
  const { id } = useLocalSearchParams<{ id: string }>()
  const canWrite = useCanWrite()
  const knowledge = useKnowledge(id)
  const upload = useUploadKnowledge(id)

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: '*/*' })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    if (!isKnowledgeFile(asset.name)) {
      showError(t('agents.knowledge.unsupported', { types: KNOWLEDGE_EXTENSIONS.join(', ') }))
      return
    }
    upload.mutate(
      { uri: asset.uri, name: asset.name, mimeType: asset.mimeType },
      { onError: (e) => showError(errorMessage(e, t) || t('agents.knowledge.uploadFailed')) },
    )
  }

  if (knowledge.isPending) return <Loading />
  if (knowledge.isError) return <ErrorState error={knowledge.error} onRetry={() => knowledge.refetch()} />
  const docs = knowledge.data.items

  return (
    <Screen onRefresh={() => knowledge.refetch()} refreshing={knowledge.isRefetching}>
      <Text tone="muted">{t('agents.knowledge.subtitle')}</Text>
      {canWrite ? (
        <Button
          label={upload.isPending ? t('agents.knowledge.uploading') : t('agents.knowledge.upload')}
          onPress={() => void pick()}
          loading={upload.isPending}
        />
      ) : null}
      {docs.length === 0 ? (
        <Text tone="muted">{t('agents.knowledge.empty')}</Text>
      ) : (
        <Card style={styles.list}>
          {docs.map((doc) => (
            <DocRow key={doc.id} agentId={id} doc={doc} canWrite={canWrite} />
          ))}
        </Card>
      )}
    </Screen>
  )
}

function DocRow({ agentId, doc, canWrite }: { agentId: string; doc: KnowledgeDoc; canWrite: boolean }) {
  const { t } = useTranslation()
  const colors = useColors()
  const pin = usePinKnowledge(agentId)
  const remove = useDeleteKnowledge(agentId)
  const confirmDelete = async () => {
    if (!(await confirmDestructive(t('agents.knowledge.deleteTitle'), t('agents.knowledge.deleteConfirm', { name: doc.title })))) return
    remove.mutate(doc.id, { onError: (e) => showError(errorMessage(e, t)) })
  }
  const PinIcon = doc.pinned ? Pin : PinOff
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={styles.flex}>
        <Text numberOfLines={1}>{doc.title}</Text>
        <View style={styles.status}>
          {doc.status === 'ready' ? (
            <CircleCheck size={14} color={colors.income} />
          ) : doc.status === 'failed' ? (
            <CircleAlert size={14} color={colors.destructive} />
          ) : (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          )}
          <Text variant="caption" tone={doc.status === 'failed' ? 'destructive' : 'muted'} numberOfLines={2} style={styles.flex}>
            {[
              doc.status === 'ready'
                ? t('agents.knowledge.ready', { count: doc.chunk_count })
                : doc.status === 'failed'
                  ? [t('agents.knowledge.failed'), doc.error].filter(Boolean).join(': ')
                  : t(`agents.knowledge.status.${doc.status}`),
              `${Math.max(1, Math.round(doc.size_bytes / 1024))} KB`,
            ].join(' · ')}
          </Text>
        </View>
      </View>
      {canWrite ? (
        <>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: doc.pinned }}
            accessibilityLabel={doc.pinned ? t('agents.knowledge.unpinTitle') : t('agents.knowledge.pinTitle')}
            hitSlop={8}
            onPress={() => pin.mutate({ id: doc.id, pinned: !doc.pinned }, { onError: (e) => showError(errorMessage(e, t)) })}
          >
            <PinIcon size={20} color={doc.pinned ? colors.warning : colors.mutedForeground} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.delete')} hitSlop={8} onPress={() => void confirmDelete()}>
            <Trash size={20} color={colors.destructive} />
          </Pressable>
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
})
