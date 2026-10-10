import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/Button'
import { ColorField } from '@/components/ColorField'
import { Screen } from '@/components/Screen'
import { Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useAssetGroups, useDeleteAssetGroup, useSaveAssetGroup } from '@/features/assets/hooks'
import type { AssetGroup } from '@/features/assets/model'
import { confirmDestructive, showError } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'

/** Create a wallet (asset group), or rename/recolour/delete one (`?id=`). */
export default function AssetGroupScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const groups = useAssetGroups()
  if (id && groups.isPending) return <Loading />
  return <GroupForm group={id ? groups.data?.find((g) => g.id === id) : undefined} />
}

function GroupForm({ group }: { group?: AssetGroup }) {
  const { t } = useTranslation()
  const save = useSaveAssetGroup()
  const remove = useDeleteAssetGroup()
  const [name, setName] = useState(group?.name ?? '')
  const [color, setColor] = useState(group?.color ?? '#3B82F6')
  const [error, setError] = useState<string | null>(null)
  const synced = Boolean(group && group.source && group.source !== 'manual')

  const submit = async () => {
    if (!name.trim()) return setError(t('assets.errors.nameRequired'))
    setError(null)
    try {
      await save.mutateAsync({ id: group?.id, body: { name: name.trim(), color } })
      router.back()
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const confirmDelete = async () => {
    if (!group || !(await confirmDestructive(t('assets.confirmDeleteWalletTitle'), t('assets.confirmDeleteWallet')))) return
    try {
      await remove.mutateAsync(group.id)
      router.back()
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: group ? t('assets.editWallet') : t('assets.newWallet') }} />
      <TextField label={t('assets.walletName')} value={name} onChangeText={setName} placeholder={t('assets.walletNamePlaceholder')} />
      {synced && group?.institution_name ? (
        <Text variant="caption" tone="muted">
          {t('assets.syncedFromHint', { source: group.institution_name })}
        </Text>
      ) : null}
      <ColorField label={t('assets.walletColor')} value={color} onChange={setColor} />
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={save.isPending} />
      {group && !synced ? <Button label={t('assets.deleteWallet')} variant="ghost" onPress={confirmDelete} loading={remove.isPending} /> : null}
    </Screen>
  )
}
