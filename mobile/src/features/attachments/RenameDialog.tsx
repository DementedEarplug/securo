import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { radius, spacing, useColors } from '@/theme'
import { splitName } from './rules'

/**
 * Rename a file without touching its extension (the server keeps the original
 * one anyway, so offering it for editing would only invite confusion).
 */
export function RenameDialog({
  filename,
  saving,
  onSave,
  onClose,
}: {
  /** The file being renamed; the dialog is hidden while this is null. */
  filename: string | null
  saving: boolean
  onSave: (filename: string) => void
  onClose: () => void
}) {
  return (
    <Modal visible={filename !== null} transparent animationType="fade" onRequestClose={onClose}>
      {/* Remounted per file so the field starts from that file's name. */}
      {filename !== null ? <RenameBody key={filename} filename={filename} saving={saving} onSave={onSave} onClose={onClose} /> : null}
    </Modal>
  )
}

function RenameBody({
  filename,
  saving,
  onSave,
  onClose,
}: {
  filename: string
  saving: boolean
  onSave: (filename: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const { base, extension } = splitName(filename)
  const [value, setValue] = useState(base)
  const trimmed = value.trim()

  const submit = () => {
    if (!trimmed || trimmed === base) {
      onClose()
      return
    }
    onSave(extension ? `${trimmed}.${extension}` : trimmed)
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.cancel')} />
      <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Text variant="heading">{t('attachments.renameTitle')}</Text>
        <TextField
          label={extension ? t('attachments.nameWithExtension', { extension }) : t('attachments.name')}
          value={value}
          onChangeText={setValue}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button label={t('common.cancel')} variant="secondary" onPress={onClose} />
          </View>
          <View style={styles.flex}>
            <Button label={t('common.save')} onPress={submit} loading={saving} disabled={!trimmed} />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.45)' },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg, gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
})
