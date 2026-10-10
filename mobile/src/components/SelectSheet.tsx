import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { font, radius, spacing, useColors } from '@/theme'
import { Icon } from './Icon'
import { ListRow } from './ListRow'
import { Text } from './Text'

export interface SelectOption {
  value: string
  label: string
  /** Shown under the label, e.g. the category group. */
  detail?: string | null
  color?: string | null
}

interface Props {
  title: string
  options: SelectOption[]
  /** Single choice when a string/null, multiple when an array. */
  selected: string | null | string[]
  onSelect: (value: string | null) => void
  onClose: () => void
  visible: boolean
  /** Label of a "none" entry that selects null (e.g. "No category"). */
  noneLabel?: string
}

/** A full-screen, searchable list for picking one option (or toggling several). */
export function SelectSheet({ title, options, selected, onSelect, onClose, visible, noneLabel }: Props) {
  const { t } = useTranslation()
  const colors = useColors()
  const [query, setQuery] = useState('')
  const multi = Array.isArray(selected)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.detail?.toLowerCase().includes(q))
  }, [options, query])

  const isSelected = (value: string) => (multi ? selected.includes(value) : selected === value)

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text variant="heading" style={styles.title}>
            {title}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={12}>
            <Icon name="close" color={colors.foreground} />
          </Pressable>
        </View>
        {options.length > 8 ? (
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('common.search')}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel={t('common.search')}
            style={[styles.search, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
          />
        ) : null}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.value}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            noneLabel && !query ? (
              <ListRow
                title={noneLabel}
                onPress={() => onSelect(null)}
                trailing={!multi && selected === null ? <Text tone="primary">✓</Text> : null}
              />
            ) : null
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.label}
              subtitle={item.detail}
              dotColor={item.color}
              onPress={() => onSelect(item.value)}
              accessibilityLabel={`${item.label}${isSelected(item.value) ? `, ${t('common.selected')}` : ''}`}
              trailing={isSelected(item.value) ? <Text tone="primary">✓</Text> : null}
            />
          )}
        />
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1 },
  search: {
    margin: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: font.md,
  },
})
