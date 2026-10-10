import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CategoryGroup } from '@/api/types'
import { Button } from '@/components/Button'
import { ColorField } from '@/components/ColorField'
import { IconField } from '@/components/IconField'
import { Screen } from '@/components/Screen'
import { Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useAllCategoryGroups, useDeleteCategoryGroup, useSaveCategoryGroup } from '@/features/categories/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'

export default function CategoryGroupScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const groups = useAllCategoryGroups()
  if (id && groups.isPending) return <Loading />
  return <GroupForm group={id ? groups.data?.find((g) => g.id === id) : undefined} count={groups.data?.length ?? 0} />
}

function GroupForm({ group, count }: { group?: CategoryGroup; count: number }) {
  const { t } = useTranslation()
  const save = useSaveCategoryGroup()
  const remove = useDeleteCategoryGroup()
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState({
    name: group?.name ?? '',
    color: group?.color ?? '#6B7280',
    icon: group?.icon ?? 'folder',
    isHidden: group?.is_hidden ?? false,
  })
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch })

  const submit = async () => {
    if (!v.name.trim()) return setError(t('groups.nameRequired'))
    setError(null)
    try {
      await save.mutateAsync({
        id: group?.id,
        body: {
          name: v.name.trim(),
          color: v.color,
          icon: v.icon,
          ...(group ? {} : { position: count }),
          ...(group?.is_system ? { is_hidden: v.isHidden } : {}),
        },
      })
      router.back()
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const confirmDelete = async () => {
    if (!group || !(await confirmDestructive(t('categories.deleteGroupTitle'), t('categories.deleteGroupBody', { name: group.name })))) return
    try {
      await remove.mutateAsync(group.id)
      router.back()
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: group ? t('categories.editGroup') : t('categories.newGroup') }} />
      <TextField label={t('groups.name')} value={v.name} onChangeText={(name) => set({ name })} />
      <IconField label={t('categories.icon')} value={v.icon} color={v.color} onChange={(icon) => set({ icon })} />
      <ColorField label={t('groups.color')} value={v.color} onChange={(color) => set({ color })} />
      {group?.is_system ? <SwitchField label={t('categories.hide')} hint={t('categories.hideHint')} value={v.isHidden} onChange={(isHidden) => set({ isHidden })} /> : null}
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={save.isPending} />
      {group ? <Button label={t('common.delete')} variant="ghost" onPress={confirmDelete} loading={remove.isPending} /> : null}
    </Screen>
  )
}
