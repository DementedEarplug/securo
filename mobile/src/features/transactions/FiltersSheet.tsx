import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { PickerField } from '@/components/PickerField'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SelectSheet } from '@/components/SelectSheet'
import { Text } from '@/components/Text'
import { accountOptions, useAccounts } from '@/features/accounts/hooks'
import { spacing, useColors } from '@/theme'
import { categoryOptions } from './category-options'
import { NO_FILTERS, PERIODS, toggle, type FilterState } from './filters'
import { useCategoryGroups } from './hooks'

interface Props {
  visible: boolean
  value: FilterState
  onApply: (value: FilterState) => void
  onClose: () => void
}

export function FiltersSheet({ visible, value, onApply, onClose }: Props) {
  const { t } = useTranslation()
  const colors = useColors()
  const [draft, setDraft] = useState(value)
  const [picking, setPicking] = useState<'accounts' | 'categories' | null>(null)
  const accounts = useAccounts().data ?? []
  const categories = categoryOptions(useCategoryGroups().data)

  const summary = (ids: string[], all: string) =>
    ids.length === 0 ? null : ids.length === 1 ? all : t('transactions.filters.selectedCount', { count: ids.length })

  return (
    <Modal visible={visible} animationType="slide" onShow={() => setDraft(value)} onRequestClose={onClose}>
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text variant="heading" style={styles.title}>
            {t('transactions.filters.title')}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={12}>
            <Icon name="close" color={colors.foreground} />
          </Pressable>
        </View>
        <View style={styles.body}>
          <Text variant="label" tone="muted">
            {t('transactions.filters.type')}
          </Text>
          <SegmentedControl
            value={draft.type}
            onChange={(type) => setDraft({ ...draft, type })}
            options={[
              { value: 'all', label: t('transactions.filters.all') },
              { value: 'debit', label: t('transactions.expense') },
              { value: 'credit', label: t('transactions.income') },
            ]}
          />
          <Text variant="label" tone="muted">
            {t('transactions.filters.period')}
          </Text>
          <SegmentedControl
            value={draft.period}
            onChange={(period) => setDraft({ ...draft, period })}
            options={PERIODS.map((period) => ({ value: period, label: t(`transactions.filters.periods.${period}`) }))}
          />
          <PickerField
            label={t('transactions.account')}
            value={summary(draft.accountIds, accounts.find((a) => a.id === draft.accountIds[0])?.name ?? '')}
            placeholder={t('transactions.filters.anyAccount')}
            onPress={() => setPicking('accounts')}
          />
          <PickerField
            label={t('transactions.category')}
            value={summary(draft.categoryIds, categories.find((c) => c.value === draft.categoryIds[0])?.label ?? '')}
            placeholder={t('transactions.filters.anyCategory')}
            onPress={() => setPicking('categories')}
          />
        </View>
        <View style={styles.actions}>
          <Button label={t('transactions.filters.clear')} variant="secondary" onPress={() => onApply(NO_FILTERS)} />
          <Button label={t('transactions.filters.apply')} onPress={() => onApply(draft)} />
        </View>
      </SafeAreaView>

      <SelectSheet
        visible={picking === 'accounts'}
        title={t('transactions.account')}
        options={accountOptions(accounts.filter((a) => !a.is_closed))}
        selected={draft.accountIds}
        onSelect={(id) => id && setDraft({ ...draft, accountIds: toggle(draft.accountIds, id) })}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'categories'}
        title={t('transactions.category')}
        options={categories}
        selected={draft.categoryIds}
        onSelect={(id) => id && setDraft({ ...draft, categoryIds: toggle(draft.categoryIds, id) })}
        onClose={() => setPicking(null)}
      />
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.md },
  actions: { marginTop: 'auto', padding: spacing.lg, gap: spacing.sm },
})
