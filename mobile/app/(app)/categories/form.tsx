import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from 'react-native'

import type { Category } from '@/api/types'
import { Button } from '@/components/Button'
import { ColorField } from '@/components/ColorField'
import { IconField } from '@/components/IconField'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SelectSheet } from '@/components/SelectSheet'
import { Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import {
  fetchCategoryUsage,
  usageCount,
  useAllCategories,
  useAllCategoryGroups,
  useDeleteCategory,
  useSaveCategory,
} from '@/features/categories/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'

export default function CategoryFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const categories = useAllCategories()
  if (id && categories.isPending) return <Loading />
  return <CategoryForm category={id ? categories.data?.find((c) => c.id === id) : undefined} all={categories.data ?? []} />
}

function CategoryForm({ category, all }: { category?: Category; all: Category[] }) {
  const { t } = useTranslation()
  const groups = useAllCategoryGroups().data ?? []
  const save = useSaveCategory()
  const remove = useDeleteCategory()
  const [picking, setPicking] = useState<'group' | 'transferTo' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState({
    name: category?.name ?? '',
    groupId: category?.group_id ?? null,
    color: category?.color ?? '#6366F1',
    icon: category?.icon ?? 'circle-help',
    treatAsTransfer: category?.treat_as_transfer ?? false,
    isIgnored: category?.is_ignored ?? false,
    isHidden: category?.is_hidden ?? false,
  })
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch })

  const submit = async (deactivateRules = false) => {
    if (!v.name.trim()) return setError(t('groups.nameRequired'))
    setError(null)
    try {
      await save.mutateAsync({
        id: category?.id,
        deactivateRules,
        body: {
          name: v.name.trim(),
          group_id: v.groupId,
          color: v.color,
          icon: v.icon,
          treat_as_transfer: v.treatAsTransfer,
          is_ignored: v.isIgnored,
          ...(category?.is_system ? { is_hidden: v.isHidden } : {}),
        },
      })
      router.back()
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  // Hiding a category that rules still assign: keep those rules or turn them off (as the web asks).
  const onSave = async () => {
    if (category && v.isHidden && !category.is_hidden) {
      const usage = await fetchCategoryUsage(category.id).catch(() => null)
      if (usage?.rules?.length) {
        Alert.alert(t('categories.hideRulesTitle'), t('categories.hideRulesBody', { count: usage.rules.length }), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('categories.keepRules'), onPress: () => void submit(false) },
          { text: t('categories.turnOffRules'), onPress: () => void submit(true) },
        ])
        return
      }
    }
    await submit()
  }

  const deleteWith = async (transferTo: string | null) => {
    setPicking(null)
    try {
      await remove.mutateAsync({ id: category!.id, transferTo })
      router.back()
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  const startDelete = async () => {
    if (!category) return
    try {
      const usage = await fetchCategoryUsage(category.id)
      if (usageCount(usage) > 0) {
        Alert.alert(
          t('categories.inUseTitle'),
          t('categories.inUseBody', {
            transactions: usage.transactions ?? 0,
            budgets: usage.budgets ?? 0,
            recurring: usage.recurring_transactions ?? 0,
            rules: usage.rules?.length ?? 0,
          }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('categories.chooseDestination'), onPress: () => setPicking('transferTo') },
          ],
        )
        return
      }
      if (await confirmDestructive(t('categories.deleteTitle'), t('categories.deleteBody', { name: category.name }))) await deleteWith(null)
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  const destinations = all
    .filter((c) => c.id !== category?.id && !c.is_hidden)
    .map((c) => ({ value: c.id, label: c.name, detail: groups.find((g) => g.id === c.group_id)?.name ?? null, color: c.color }))

  return (
    <Screen>
      <Stack.Screen options={{ title: category ? t('categories.editTitle') : t('categories.newTitle') }} />
      <TextField label={t('groups.name')} value={v.name} onChangeText={(name) => set({ name })} />
      <PickerField
        label={t('categories.group')}
        value={groups.find((g) => g.id === v.groupId)?.name ?? null}
        placeholder={t('categories.noGroup')}
        onPress={() => setPicking('group')}
      />
      <IconField label={t('categories.icon')} value={v.icon} color={v.color} onChange={(icon) => set({ icon })} />
      <ColorField label={t('groups.color')} value={v.color} onChange={(color) => set({ color })} />
      <SwitchField label={t('categories.treatAsTransfer')} hint={t('categories.treatAsTransferHint')} value={v.treatAsTransfer} onChange={(treatAsTransfer) => set({ treatAsTransfer })} />
      <SwitchField label={t('categories.isIgnored')} hint={t('categories.isIgnoredHint')} value={v.isIgnored} onChange={(isIgnored) => set({ isIgnored })} />
      {category?.is_system ? (
        <SwitchField label={t('categories.hide')} hint={t('categories.hideHint')} value={v.isHidden} onChange={(isHidden) => set({ isHidden })} />
      ) : null}
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={onSave} loading={save.isPending} />
      {category ? <Button label={t('common.delete')} variant="ghost" onPress={startDelete} loading={remove.isPending} /> : null}

      <SelectSheet
        visible={picking === 'group'}
        title={t('categories.group')}
        options={groups.map((g) => ({ value: g.id, label: g.name, color: g.color }))}
        selected={v.groupId}
        noneLabel={t('categories.noGroup')}
        onSelect={(groupId) => {
          set({ groupId })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'transferTo'}
        title={t('categories.moveTo')}
        options={destinations}
        selected={null}
        onSelect={(id) => id && void deleteWith(id)}
        onClose={() => setPicking(null)}
      />
    </Screen>
  )
}
