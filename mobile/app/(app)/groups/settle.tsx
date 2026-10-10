import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/Button'
import { DateField } from '@/components/DateField'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SelectSheet } from '@/components/SelectSheet'
import { Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { accountNameById, accountOptions, useAccounts } from '@/features/accounts/hooks'
import { memberName, useCreateSettlement, useGroup } from '@/features/groups/hooks'
import { useDisplayFormat } from '@/features/session/hooks'
import { toIsoDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatAmountInput, parseAmountInput } from '@/lib/format'

/** Record that one member paid another back (optionally as a transaction in your account). */
export default function SettleScreen() {
  const { t } = useTranslation()
  const { locale } = useDisplayFormat()
  const params = useLocalSearchParams<{ groupId: string; from?: string; to?: string; amount?: string; currency?: string }>()
  const group = useGroup(params.groupId)
  const accounts = (useAccounts().data ?? []).filter((a) => !a.is_closed)
  const create = useCreateSettlement(params.groupId)
  const [picking, setPicking] = useState<'from' | 'to' | 'account' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState({
    from: params.from ?? '',
    to: params.to ?? '',
    amount: params.amount ? formatAmountInput(Number(params.amount), locale) : '',
    date: toIsoDate(new Date()),
    accountId: null as string | null,
    notes: '',
  })
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch })

  if (group.isPending) return <Loading />
  const members = group.data?.members ?? []
  const self = members.find((m) => m.is_self)
  const currency = params.currency ?? group.data?.default_currency ?? 'USD'

  const submit = async () => {
    const amount = parseAmountInput(v.amount, locale)
    if (!v.from || !v.to || v.from === v.to) return setError(t('groups.chooseTwoMembers'))
    if (amount === null || amount <= 0) return setError(t('transactions.form.amountInvalid'))
    setError(null)
    try {
      await create.mutateAsync({
        from_member_id: v.from,
        to_member_id: v.to,
        amount: String(amount),
        currency,
        date: v.date,
        notes: v.notes.trim() || null,
        // Only the payer's own account can carry the payment as a transaction.
        ...(v.accountId && v.from === self?.id ? { account_id: v.accountId } : {}),
      })
      router.back()
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const memberOptions = members.map((m) => ({ value: m.id, label: m.name }))
  return (
    <Screen>
      <PickerField label={t('groups.payer')} value={v.from ? memberName(members, v.from) : null} placeholder={t('groups.chooseMember')} onPress={() => setPicking('from')} />
      <PickerField label={t('groups.receiver')} value={v.to ? memberName(members, v.to) : null} placeholder={t('groups.chooseMember')} onPress={() => setPicking('to')} />
      <TextField label={`${t('transactions.amount')} (${currency})`} value={v.amount} onChangeText={(amount) => set({ amount })} keyboardType="decimal-pad" />
      <DateField label={t('transactions.date')} value={v.date} onChange={(date) => set({ date })} />
      {v.from && v.from === self?.id ? (
        <>
          <PickerField
            label={t('groups.paidFrom')}
            value={accountNameById(accounts, v.accountId)}
            placeholder={t('groups.dontRecord')}
            onPress={() => setPicking('account')}
          />
          <Text variant="caption" tone="muted">
            {t('groups.paidFromHint')}
          </Text>
        </>
      ) : null}
      <TextField label={t('transactions.notes')} value={v.notes} onChangeText={(notes) => set({ notes })} />
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={create.isPending} />
      <SelectSheet
        visible={picking === 'from' || picking === 'to'}
        title={picking === 'to' ? t('groups.receiver') : t('groups.payer')}
        options={memberOptions}
        selected={picking === 'to' ? v.to || null : v.from || null}
        onSelect={(id) => {
          if (id) set(picking === 'to' ? { to: id } : { from: id })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'account'}
        title={t('groups.paidFrom')}
        options={accountOptions(accounts)}
        selected={v.accountId}
        noneLabel={t('groups.dontRecord')}
        onSelect={(accountId) => {
          set({ accountId })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
    </Screen>
  )
}
