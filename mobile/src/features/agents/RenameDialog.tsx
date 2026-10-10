import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable, StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { radius, spacing, useColors } from '@/theme'

/** A small dialog to rename a conversation (Android has no Alert.prompt). */
export function RenameDialog({
  initial,
  onCancel,
  onSave,
  saving,
}: {
  initial: string
  onCancel: () => void
  onSave: (title: string) => void
  saving: boolean
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const [title, setTitle] = useState(initial)
  const submit = () => {
    const value = title.trim()
    if (!value || value === initial) onCancel()
    else onSave(value)
  }
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel={t('common.cancel')}>
        <Pressable style={[styles.dialog, { backgroundColor: colors.card }]} onPress={() => undefined}>
          <Text variant="heading">{t('agents.conversation.rename')}</Text>
          <TextField
            label={t('agents.conversation.title')}
            value={title}
            onChangeText={setTitle}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} />
            </View>
            <View style={styles.flex}>
              <Button label={t('common.save')} onPress={submit} loading={saving} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.xl },
  dialog: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
})
