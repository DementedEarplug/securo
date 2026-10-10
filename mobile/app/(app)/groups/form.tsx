import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/Button'
import { ColorField } from '@/components/ColorField'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SelectSheet } from '@/components/SelectSheet'
import { Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useCurrencies } from '@/features/accounts/hooks'
import { GROUP_KINDS, type GroupKind, useCreateGroup, useDeleteGroup, useGroup, useUpdateGroup, type Group } from '@/features/groups/hooks'
import { useDisplayFormat } from '@/features/session/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'

export default function GroupFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const group = useGroup(id ?? '')
  if (id && group.isPending) return <Loading />
  return <GroupForm group={id ? group.data : undefined} />
}

function GroupForm({ group }: { group?: Group }) {
  const { t } = useTranslation()
  const { currency } = useDisplayFormat()
  const currencies = useCurrencies().data ?? []
  const create = useCreateGroup()
  const update = useUpdateGroup(group?.id ?? '')
  const remove = useDeleteGroup()
  const [picking, setPicking] = useState<'kind' | 'currency' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState({
    name: group?.name ?? '',
    kind: (group?.kind ?? 'social') as GroupKind,
    currency: group?.default_currency ?? currency,
    color: group?.color ?? '#3B82F6',
    notes: group?.notes ?? '',
    archived: group?.is_archived ?? false,
  })
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch })

  const submit = async () => {
    if (!v.name.trim()) return setError(t('groups.nameRequired'))
    setError(null)
    const body = { name: v.name.trim(), kind: v.kind, default_currency: v.currency, color: v.color, notes: v.notes.trim() || null }
    try {
      if (group) {
        await update.mutateAsync({ ...body, is_archived: v.archived })
        router.back()
      } else {
        const created = await create.mutateAsync(body)
        router.replace({ pathname: '/groups/[id]', params: { id: created.id } })
      }
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const confirmDelete = async () => {
    if (!group || !(await confirmDestructive(t('groups.deleteTitle'), t('groups.deleteBody', { name: group.name })))) return
    try {
      await remove.mutateAsync(group.id)
      router.dismissTo('/groups')
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: group ? t('groups.editTitle') : t('groups.newTitle') }} />
      <TextField label={t('groups.name')} value={v.name} onChangeText={(name) => set({ name })} />
      <PickerField label={t('groups.kind')} value={t(`groups.kinds.${v.kind}`)} placeholder="" onPress={() => setPicking('kind')} />
      <PickerField label={t('groups.currency')} value={v.currency} placeholder="" onPress={() => setPicking('currency')} />
      <ColorField label={t('groups.color')} value={v.color} onChange={(color) => set({ color })} />
      <TextField label={t('transactions.notes')} value={v.notes} onChangeText={(notes) => set({ notes })} multiline />
      {group ? <SwitchField label={t('groups.archive')} hint={t('groups.archiveHint')} value={v.archived} onChange={(archived) => set({ archived })} /> : null}
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={create.isPending || update.isPending} />
      {group?.is_owner ? <Button label={t('common.delete')} variant="ghost" onPress={confirmDelete} loading={remove.isPending} /> : null}
      <SelectSheet
        visible={picking === 'kind'}
        title={t('groups.kind')}
        options={GROUP_KINDS.map((value) => ({ value, label: t(`groups.kinds.${value}`) }))}
        selected={v.kind}
        onSelect={(kind) => {
          if (kind) set({ kind: kind as GroupKind })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'currency'}
        title={t('groups.currency')}
        options={currencies.map((c) => ({ value: c.code, label: `${c.flag ?? ''} ${c.code}`.trim(), detail: c.name }))}
        selected={v.currency}
        onSelect={(code) => {
          if (code) set({ currency: code })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
    </Screen>
  )
}
