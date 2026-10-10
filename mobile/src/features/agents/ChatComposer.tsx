import Send from 'lucide-react-native/icons/send'
import Square from 'lucide-react-native/icons/square'
import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'

import { Text } from '@/components/Text'
import { font, radius, spacing, useColors } from '@/theme'

interface Props {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  streaming: boolean
  /** Viewers can read conversations but not chat (the server refuses it). */
  canWrite: boolean
  placeholder: string
}

/** The message box under a chat; becomes a Stop button while a reply streams. */
export const ChatComposer = forwardRef<TextInput, Props>(function ChatComposer(
  { value, onChange, onSend, onStop, streaming, canWrite, placeholder },
  ref,
) {
  const { t } = useTranslation()
  const colors = useColors()

  if (!canWrite) {
    return (
      <View style={[styles.bar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
        <Text variant="caption" tone="muted" style={styles.notice}>
          {t('agents.chat.readOnly')}
        </Text>
      </View>
    )
  }

  const canSend = !streaming && value.trim().length > 0
  return (
    <View style={[styles.bar, styles.row, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={placeholder}
        multiline
        style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
      />
      {streaming ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('agents.chat.stop')}
          onPress={onStop}
          style={[styles.button, { backgroundColor: colors.foreground }]}
        >
          <Square size={16} color={colors.background} fill={colors.background} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('agents.chat.send')}
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={onSend}
          style={[styles.button, { backgroundColor: colors.primary, opacity: canSend ? 1 : 0.4 }]}
        >
          <Send size={18} color={colors.primaryForeground} />
        </Pressable>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  notice: { textAlign: 'center' },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: font.md,
    textAlignVertical: 'top',
  },
  button: { width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
})
