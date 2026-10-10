import type { LucideIcon } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CATEGORY_ICONS } from '@/lib/category-icons'
import { font, radius, spacing, useColors } from '@/theme'
import { CategoryIcon } from './CategoryIcon'
import { Icon } from './Icon'
import { PickerField } from './PickerField'
import { Text } from './Text'

/** Pick one of the category icons the web app offers. */
export function IconField({
  label,
  value,
  color,
  onChange,
  fallback,
  fallbackLabel,
}: {
  label: string
  value: string
  color: string
  onChange: (value: string) => void
  /** Icon and name shown for a value outside the catalogue, such as a goal's default. */
  fallback?: LucideIcon
  fallbackLabel?: string
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? CATEGORY_ICONS.filter((i) => i.name.includes(q) || i.label.toLowerCase().includes(q)) : CATEGORY_ICONS
  }, [query])

  return (
    <>
      <View style={styles.row}>
        <CategoryIcon icon={value} color={color} size="lg" fallback={fallback} />
        <View style={styles.flex}>
          <PickerField
            label={label}
            value={CATEGORY_ICONS.find((i) => i.name === value)?.label ?? fallbackLabel ?? value}
            placeholder={label}
            onPress={() => setOpen(true)}
          />
        </View>
      </View>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text variant="heading" style={styles.flex}>
              {label}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setOpen(false)} hitSlop={12}>
              <Icon name="close" color={colors.foreground} />
            </Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('common.search')}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel={t('common.search')}
            style={[styles.search, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
          />
          <FlatList
            data={filtered}
            numColumns={5}
            keyExtractor={(item) => item.name}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: item.name === value }}
                onPress={() => {
                  onChange(item.name)
                  setOpen(false)
                }}
                style={[styles.cell, item.name === value && { backgroundColor: colors.accent }]}
              >
                <CategoryIcon icon={item.name} color={color} size="lg" />
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  search: { margin: spacing.lg, minHeight: 44, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: font.md },
  grid: { paddingHorizontal: spacing.md },
  cell: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.md },
})
