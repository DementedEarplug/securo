import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ApiError } from '@/api/errors'
import { Button } from '@/components/Button'
import { Screen } from '@/components/Screen'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SelectSheet } from '@/components/SelectSheet'
import { Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useDeletePayee, useMergePayees, usePayees, useSavePayee, type Payee } from '@/features/payees/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'

export default function PayeeFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const payees = usePayees()
  if (id && payees.isPending) return <Loading />
  return <PayeeForm payee={id ? payees.data?.find((p) => p.id === id) : undefined} all={payees.data ?? []} />
}

function PayeeForm({ payee, all }: { payee?: Payee; all: Payee[] }) {
  const { t } = useTranslation()
  const save = useSavePayee()
  const remove = useDeletePayee()
  const merge = useMergePayees()
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState({
    name: payee?.name ?? '',
    type: (payee?.type ?? 'none') as 'person' | 'company' | 'none',
    email: payee?.email ?? '',
    phone: payee?.phone ?? '',
    website: payee?.website ?? '',
    address: payee?.address ?? '',
    notes: payee?.notes ?? '',
  })
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch })

  const submit = async () => {
    if (!v.name.trim()) return setError(t('groups.nameRequired'))
    setError(null)
    const blank = (s: string) => s.trim() || null
    try {
      await save.mutateAsync({
        id: payee?.id,
        body: {
          name: v.name.trim(),
          type: v.type === 'none' ? null : v.type,
          email: blank(v.email),
          phone: blank(v.phone),
          website: blank(v.website),
          address: blank(v.address),
          notes: blank(v.notes),
        },
      })
      router.back()
    } catch (e) {
      setError(e instanceof ApiError && e.detail === 'duplicate_payee_name' ? t('payees.duplicateName') : errorMessage(e, t))
    }
  }

  const confirmDelete = async () => {
    if (!payee || !(await confirmDestructive(t('payees.deleteTitle'), t('payees.deleteBody', { name: payee.name })))) return
    try {
      await remove.mutateAsync(payee.id)
      router.back()
    } catch (e) {
      showError(e instanceof ApiError && e.code === 'payee_has_invoices' ? t('payees.hasInvoices') : errorMessage(e, t))
    }
  }

  const mergeInto = async (targetId: string) => {
    setMerging(false)
    const target = all.find((p) => p.id === targetId)
    if (!payee || !target) return
    if (!(await confirmDestructive(t('payees.mergeTitle'), t('payees.mergeBody', { source: payee.name, target: target.name }), t('payees.merge')))) return
    try {
      await merge.mutateAsync({ source_ids: [payee.id], target_id: targetId })
      router.back()
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: payee ? t('payees.editTitle') : t('payees.newTitle') }} />
      <TextField label={t('groups.name')} value={v.name} onChangeText={(name) => set({ name })} />
      <SegmentedControl
        value={v.type}
        onChange={(type) => set({ type })}
        options={[
          { value: 'none', label: t('payees.types.none') },
          { value: 'person', label: t('payees.types.person') },
          { value: 'company', label: t('payees.types.company') },
        ]}
      />
      <TextField label={t('payees.email')} value={v.email} onChangeText={(email) => set({ email })} keyboardType="email-address" autoCapitalize="none" />
      <TextField label={t('payees.phone')} value={v.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" />
      <TextField label={t('payees.website')} value={v.website} onChangeText={(website) => set({ website })} keyboardType="url" autoCapitalize="none" />
      <TextField label={t('payees.address')} value={v.address} onChangeText={(address) => set({ address })} multiline />
      <TextField label={t('transactions.notes')} value={v.notes} onChangeText={(notes) => set({ notes })} multiline />
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={save.isPending} />
      {payee ? (
        <>
          <Button label={t('payees.mergeInto')} variant="secondary" onPress={() => setMerging(true)} loading={merge.isPending} />
          <Button label={t('common.delete')} variant="ghost" onPress={confirmDelete} loading={remove.isPending} />
        </>
      ) : null}
      <SelectSheet
        visible={merging}
        title={t('payees.mergeInto')}
        options={all.filter((p) => p.id !== payee?.id).map((p) => ({ value: p.id, label: p.name }))}
        selected={null}
        onSelect={(id) => id && void mergeInto(id)}
        onClose={() => setMerging(false)}
      />
    </Screen>
  )
}
