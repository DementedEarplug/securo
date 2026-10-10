import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/Button'
import { Screen } from '@/components/Screen'
import { Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useDeleteMember, useGroup, useSaveMember, type Member } from '@/features/groups/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'

export default function MemberScreen() {
  const { groupId, memberId } = useLocalSearchParams<{ groupId: string; memberId?: string }>()
  const group = useGroup(groupId)
  if (group.isPending) return <Loading />
  const member = group.data?.members?.find((m) => m.id === memberId)
  return <MemberForm groupId={groupId} member={member} />
}

function MemberForm({ groupId, member }: { groupId: string; member?: Member }) {
  const { t } = useTranslation()
  const save = useSaveMember(groupId)
  const remove = useDeleteMember(groupId)
  const [name, setName] = useState(member?.name ?? '')
  const [email, setEmail] = useState(member?.email ?? '')
  const [isSelf, setIsSelf] = useState(member?.is_self ?? false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) return setError(t('groups.nameRequired'))
    setError(null)
    try {
      await save.mutateAsync({ id: member?.id, body: { name: name.trim(), email: email.trim() || null, is_self: isSelf } })
      router.back()
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const confirmDelete = async () => {
    if (!member || !(await confirmDestructive(t('groups.removeMemberTitle'), t('groups.removeMemberBody', { name: member.name })))) return
    try {
      await remove.mutateAsync(member.id)
      router.back()
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: member ? t('groups.editMember') : t('groups.addMember') }} />
      <TextField label={t('groups.name')} value={name} onChangeText={setName} />
      <TextField
        label={t('groups.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder={t('groups.emailPlaceholder')}
      />
      <Text variant="caption" tone="muted">
        {t('groups.emailHint')}
      </Text>
      <SwitchField label={t('groups.isSelf')} hint={t('groups.isSelfHint')} value={isSelf} onChange={setIsSelf} />
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={save.isPending} />
      {member ? <Button label={t('groups.removeMember')} variant="ghost" onPress={confirmDelete} loading={remove.isPending} /> : null}
    </Screen>
  )
}
