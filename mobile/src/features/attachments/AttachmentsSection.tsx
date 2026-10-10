import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import Camera from 'lucide-react-native/icons/camera'
import EllipsisVertical from 'lucide-react-native/icons/ellipsis-vertical'
import FileText from 'lucide-react-native/icons/file-text'
import ImageIcon from 'lucide-react-native/icons/image'
import Paperclip from 'lucide-react-native/icons/paperclip'
import type { LucideIcon } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { ListRow } from '@/components/ListRow'
import { SectionHeader } from '@/components/SectionHeader'
import { Text } from '@/components/Text'
import { useDisplayFormat } from '@/features/session/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { formatDate } from '@/lib/dates'
import { shareFile } from '@/lib/download'
import { errorMessage } from '@/lib/errors'
import type { PickedFile } from '@/lib/upload'
import { radius, spacing, useColors } from '@/theme'
import {
  downloadAttachment,
  useAttachmentFile,
  useAttachmentLimits,
  useAttachments,
  useDeleteAttachment,
  useRenameAttachment,
  useUploadAttachment,
  type Attachment,
} from './hooks'
import { RenameDialog } from './RenameDialog'
import { checkAttachment, formatFileSize, isPreviewable, photoFilename, pickerMimeTypes } from './rules'

/**
 * Receipts and documents on a transaction: list, view, add (camera, photo
 * library or any file the server accepts), rename and delete. Viewers only see
 * and open them.
 */
export function AttachmentsSection({ transactionId, canWrite }: { transactionId: string; canWrite: boolean }) {
  const { t } = useTranslation()
  const colors = useColors()
  const { locale, dateLocale } = useDisplayFormat()
  const limits = useAttachmentLimits()
  const attachments = useAttachments(transactionId)
  const upload = useUploadAttachment(transactionId)
  const rename = useRenameAttachment(transactionId)
  const remove = useDeleteAttachment(transactionId)
  const [renaming, setRenaming] = useState<Attachment | null>(null)
  const [previewing, setPreviewing] = useState<Attachment | null>(null)
  const [opening, setOpening] = useState<string | null>(null)

  const items = attachments.data ?? []
  const full = items.length >= limits.max_attachments_per_transaction

  const send = async (picked: PickedFile & { size?: number | null }) => {
    const problem = checkAttachment(picked, limits, items.length)
    if (problem) {
      Alert.alert(t('attachments.cannotAddTitle'), t(problem.key, problem.params))
      return
    }
    try {
      await upload.mutateAsync(picked)
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(t('attachments.cameraDeniedTitle'), t('attachments.cameraDeniedBody'))
      return
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
    const asset = result.canceled ? null : result.assets[0]
    if (asset) await send({ uri: asset.uri, name: photoFilename(asset), mimeType: asset.mimeType, size: asset.fileSize })
  }

  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 })
    const asset = result.canceled ? null : result.assets[0]
    if (asset) await send({ uri: asset.uri, name: photoFilename(asset), mimeType: asset.mimeType, size: asset.fileSize })
  }

  const chooseFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: pickerMimeTypes(limits),
      copyToCacheDirectory: true,
      multiple: false,
    })
    const asset = result.canceled ? null : result.assets[0]
    if (asset) await send({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size })
  }

  const open = async (attachment: Attachment) => {
    if (isPreviewable(attachment.content_type)) {
      setPreviewing(attachment)
      return
    }
    setOpening(attachment.id)
    try {
      const file = await downloadAttachment(transactionId, attachment)
      await shareFile(file, attachment.content_type, attachment.filename)
    } catch (e) {
      showError(errorMessage(e, t))
    } finally {
      setOpening(null)
    }
  }

  const confirmDelete = async (attachment: Attachment) => {
    if (!(await confirmDestructive(t('attachments.deleteTitle'), t('attachments.deleteBody', { name: attachment.filename })))) return
    try {
      await remove.mutateAsync(attachment.id)
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  const showActions = (attachment: Attachment) => {
    Alert.alert(attachment.filename, undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('attachments.rename'), onPress: () => setRenaming(attachment) },
      { text: t('common.delete'), style: 'destructive', onPress: () => void confirmDelete(attachment) },
    ])
  }

  const saveRename = async (filename: string) => {
    if (!renaming) return
    try {
      await rename.mutateAsync({ id: renaming.id, filename })
      setRenaming(null)
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  return (
    <View style={styles.section}>
      <SectionHeader
        title={
          items.length
            ? t('attachments.titleCount', { count: items.length, max: limits.max_attachments_per_transaction })
            : t('attachments.title')
        }
      />
      <Card style={styles.list}>
        {attachments.isPending ? (
          <View style={styles.status}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : attachments.isError ? (
          <ListRow title={t('attachments.loadError')} subtitle={t('common.retry')} onPress={() => void attachments.refetch()} />
        ) : items.length === 0 && !upload.isPending ? (
          <View style={styles.empty}>
            <Paperclip size={18} color={colors.mutedForeground} />
            <Text tone="muted" style={styles.flex}>
              {canWrite ? t('attachments.emptyWritable') : t('attachments.empty')}
            </Text>
          </View>
        ) : (
          items.map((attachment) => (
            <AttachmentRow
              key={attachment.id}
              transactionId={transactionId}
              attachment={attachment}
              subtitle={`${formatFileSize(attachment.size, locale)} · ${formatDate(attachment.created_at, dateLocale)}`}
              busy={opening === attachment.id || (remove.isPending && remove.variables === attachment.id)}
              onPress={() => void open(attachment)}
              onMore={canWrite ? () => showActions(attachment) : undefined}
            />
          ))
        )}
        {upload.isPending ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.primary} />
            <Text tone="muted">{t('attachments.uploading')}</Text>
          </View>
        ) : null}
      </Card>

      {canWrite && !full ? (
        <View style={styles.addRow}>
          <AddButton icon={Camera} label={t('attachments.camera')} onPress={() => void takePhoto()} disabled={upload.isPending} />
          <AddButton icon={ImageIcon} label={t('attachments.photo')} onPress={() => void choosePhoto()} disabled={upload.isPending} />
          <AddButton icon={FileText} label={t('attachments.file')} onPress={() => void chooseFile()} disabled={upload.isPending} />
        </View>
      ) : null}
      {canWrite && full ? (
        <Text variant="caption" tone="muted">
          {t('attachments.maxReached', { max: limits.max_attachments_per_transaction })}
        </Text>
      ) : null}

      <RenameDialog
        filename={renaming?.filename ?? null}
        saving={rename.isPending}
        onSave={(filename) => void saveRename(filename)}
        onClose={() => setRenaming(null)}
      />
      <ImagePreview transactionId={transactionId} attachment={previewing} onClose={() => setPreviewing(null)} />
    </View>
  )
}

function AttachmentRow({
  transactionId,
  attachment,
  subtitle,
  busy,
  onPress,
  onMore,
}: {
  transactionId: string
  attachment: Attachment
  subtitle: string
  busy: boolean
  onPress: () => void
  onMore?: () => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const previewable = isPreviewable(attachment.content_type)
  const thumbnail = useAttachmentFile(transactionId, attachment, previewable).data

  return (
    <ListRow
      title={attachment.filename}
      subtitle={subtitle}
      onPress={onPress}
      accessibilityLabel={t('attachments.openLabel', { name: attachment.filename })}
      leading={
        <View style={[styles.thumb, { backgroundColor: colors.muted }]}>
          {thumbnail ? (
            <Image source={{ uri: thumbnail }} style={styles.thumbImage} accessibilityIgnoresInvertColors />
          ) : previewable ? (
            <ImageIcon size={18} color={colors.mutedForeground} />
          ) : (
            <FileText size={18} color={colors.mutedForeground} />
          )}
        </View>
      }
      trailing={
        busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : onMore ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('attachments.actionsLabel', { name: attachment.filename })}
            onPress={onMore}
            hitSlop={12}
          >
            <EllipsisVertical size={20} color={colors.mutedForeground} />
          </Pressable>
        ) : null
      }
    />
  )
}

function AddButton({ icon: Glyph, label, onPress, disabled }: { icon: LucideIcon; label: string; onPress: () => void; disabled: boolean }) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.addButton,
        { backgroundColor: colors.muted, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      <Glyph size={20} color={colors.primary} />
      <Text variant="caption">{label}</Text>
    </Pressable>
  )
}

/** A full-screen look at an image attachment, with a way to send it elsewhere. */
function ImagePreview({
  transactionId,
  attachment,
  onClose,
}: {
  transactionId: string
  attachment: Attachment | null
  onClose: () => void
}) {
  return (
    <Modal visible={attachment !== null} animationType="fade" onRequestClose={onClose}>
      {attachment ? <ImagePreviewBody transactionId={transactionId} attachment={attachment} onClose={onClose} /> : null}
    </Modal>
  )
}

function ImagePreviewBody({ transactionId, attachment, onClose }: { transactionId: string; attachment: Attachment; onClose: () => void }) {
  const { t } = useTranslation()
  const file = useAttachmentFile(transactionId, attachment, true)

  const share = async () => {
    try {
      const local = await downloadAttachment(transactionId, attachment)
      await shareFile(local, attachment.content_type, attachment.filename)
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  return (
    <SafeAreaView style={styles.previewRoot}>
      <View style={styles.previewHeader}>
        <Text numberOfLines={1} style={[styles.flex, styles.previewTitle]}>
          {attachment.filename}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('attachments.share')} onPress={() => void share()} hitSlop={12}>
          <Text style={styles.previewTitle}>{t('attachments.share')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={12}>
          <Icon name="close" color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.previewBody}>
        {file.data ? (
          <Image
            source={{ uri: file.data }}
            style={styles.previewImage}
            resizeMode="contain"
            accessibilityLabel={attachment.filename}
            accessibilityIgnoresInvertColors
          />
        ) : file.isError ? (
          <Text style={styles.previewTitle}>{errorMessage(file.error, t)}</Text>
        ) : (
          <ActivityIndicator color="#FFFFFF" size="large" />
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  list: { padding: 0, overflow: 'hidden' },
  status: { padding: spacing.lg, alignItems: 'center' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  flex: { flex: 1 },
  thumb: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImage: { width: 40, height: 40 },
  addRow: { flexDirection: 'row', gap: spacing.sm },
  addButton: { flex: 1, minHeight: 64, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  previewRoot: { flex: 1, backgroundColor: '#000000' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg },
  previewTitle: { color: '#FFFFFF' },
  previewBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewImage: { width: '100%', height: '100%' },
})
