import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import Target from 'lucide-react-native/icons/target'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { ColorField } from '@/components/ColorField'
import { DateField } from '@/components/DateField'
import { IconField } from '@/components/IconField'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SelectSheet, type SelectOption } from '@/components/SelectSheet'
import { Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { accountOptions, useAccounts, useCurrencies } from '@/features/accounts/hooks'
import { useAssetGroups, useAssets } from '@/features/assets/hooks'
import { TRACKING_TYPES, useDeleteGoal, useGoals, useSaveGoal, type Goal, type TrackingType } from '@/features/goals/hooks'
import { useDisplayFormat } from '@/features/session/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'
import { formatAmountInput, parseAmountInput } from '@/lib/format'
import { spacing } from '@/theme'

const STATUS_ACTIONS: Record<string, { label: string; status: string }[]> = {
  active: [
    { label: 'goals.pause', status: 'paused' },
    { label: 'goals.complete', status: 'completed' },
    { label: 'goals.archive', status: 'archived' },
  ],
  paused: [
    { label: 'goals.resume', status: 'active' },
    { label: 'goals.archive', status: 'archived' },
  ],
  completed: [{ label: 'goals.reactivate', status: 'active' }],
  archived: [{ label: 'goals.reactivate', status: 'active' }],
}

export default function GoalFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const goals = useGoals()
  if (id && goals.isPending) return <Loading />
  return <GoalForm goal={id ? goals.data?.find((g) => g.id === id) : undefined} />
}

function GoalForm({ goal }: { goal?: Goal }) {
  const { t } = useTranslation()
  const { locale, currency } = useDisplayFormat()
  const accounts = (useAccounts().data ?? []).filter((a) => !a.is_closed)
  const assets = useAssets().data ?? []
  const assetGroups = useAssetGroups().data ?? []
  const currencies = useCurrencies().data ?? []
  const save = useSaveGoal()
  const remove = useDeleteGoal()
  const [picking, setPicking] = useState<'tracking' | 'link' | 'currency' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState({
    name: goal?.name ?? '',
    target: goal ? formatAmountInput(Number(goal.target_amount), locale) : '',
    current: goal ? formatAmountInput(Number(goal.current_amount), locale) : '',
    currency: goal?.currency ?? currency,
    tracking: (goal?.tracking_type ?? 'manual') as TrackingType,
    linkId: goal?.account_id ?? goal?.asset_id ?? goal?.asset_group_id ?? null,
    targetDate: goal?.target_date ?? null,
    icon: goal?.icon ?? 'target',
    color: goal?.color ?? '#3B82F6',
  })
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch })

  const linkOptions: SelectOption[] =
    v.tracking === 'account'
      ? accountOptions(accounts)
      : v.tracking === 'asset'
        ? assets.map((a) => ({ value: a.id, label: a.name, detail: a.ticker ?? a.type }))
        : v.tracking === 'asset_group'
          ? assetGroups.map((g) => ({ value: g.id, label: g.name }))
          : []
  const needsLink = v.tracking === 'account' || v.tracking === 'asset' || v.tracking === 'asset_group'

  const submit = async (status?: string) => {
    const target = parseAmountInput(v.target, locale)
    const current = parseAmountInput(v.current || '0', locale)
    if (!v.name.trim()) return setError(t('groups.nameRequired'))
    if (target === null || target <= 0) return setError(t('transactions.form.amountInvalid'))
    if (needsLink && !v.linkId) return setError(t('goals.linkRequired'))
    setError(null)
    try {
      await save.mutateAsync({
        id: goal?.id,
        body: {
          name: v.name.trim(),
          target_amount: String(target),
          currency: v.currency,
          tracking_type: v.tracking,
          // Only the link matching the tracking type is kept on the server.
          account_id: v.tracking === 'account' ? v.linkId : null,
          asset_id: v.tracking === 'asset' ? v.linkId : null,
          asset_group_id: v.tracking === 'asset_group' ? v.linkId : null,
          ...(v.tracking === 'manual' ? { current_amount: String(current ?? 0) } : {}),
          target_date: v.targetDate,
          icon: v.icon,
          color: v.color,
          ...(status ? { status } : {}),
        },
      })
      router.back()
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const confirmDelete = async () => {
    if (!goal || !(await confirmDestructive(t('goals.deleteTitle'), t('goals.deleteBody', { name: goal.name })))) return
    try {
      await remove.mutateAsync(goal.id)
      router.back()
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: goal ? t('goals.editTitle') : t('goals.newTitle') }} />
      <TextField label={t('groups.name')} value={v.name} onChangeText={(name) => set({ name })} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField label={t('goals.target')} value={v.target} onChangeText={(target) => set({ target })} keyboardType="decimal-pad" />
        </View>
        <View style={styles.currency}>
          <PickerField label={t('accounts.form.currency')} value={v.currency} placeholder="" onPress={() => setPicking('currency')} />
        </View>
      </View>
      <PickerField label={t('goals.tracking')} value={t(`goals.trackingTypes.${v.tracking}`)} placeholder="" onPress={() => setPicking('tracking')} />
      {needsLink ? (
        <PickerField
          label={t(`goals.trackingTypes.${v.tracking}`)}
          value={linkOptions.find((o) => o.value === v.linkId)?.label ?? null}
          placeholder={t('rules.choose')}
          onPress={() => setPicking('link')}
        />
      ) : null}
      {v.tracking === 'manual' ? (
        <TextField label={t('goals.current')} value={v.current} onChangeText={(current) => set({ current })} keyboardType="decimal-pad" />
      ) : (
        <Text variant="caption" tone="muted">
          {t('goals.trackingHint')}
        </Text>
      )}
      {v.targetDate ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <DateField label={t('goals.targetDate')} value={v.targetDate} onChange={(targetDate) => set({ targetDate })} />
          </View>
          <Button label={t('recurring.noEnd')} variant="ghost" onPress={() => set({ targetDate: null })} />
        </View>
      ) : (
        <PickerField
          label={t('goals.targetDate')}
          value={null}
          placeholder={t('goals.noDate')}
          onPress={() => set({ targetDate: `${new Date().getFullYear() + 1}-12-31` })}
        />
      )}
      <IconField
        label={t('categories.icon')}
        value={v.icon}
        color={v.color}
        onChange={(icon) => set({ icon })}
        fallback={Target}
        fallbackLabel={t('goals.defaultIcon')}
      />
      <ColorField label={t('groups.color')} value={v.color} onChange={(color) => set({ color })} />
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={() => submit()} loading={save.isPending} />
      {goal
        ? (STATUS_ACTIONS[goal.status] ?? []).map((action) => (
            <Button key={action.status} label={t(action.label)} variant="secondary" onPress={() => submit(action.status)} />
          ))
        : null}
      {goal ? <Button label={t('common.delete')} variant="ghost" onPress={confirmDelete} loading={remove.isPending} /> : null}

      <SelectSheet
        visible={picking === 'tracking'}
        title={t('goals.tracking')}
        options={TRACKING_TYPES.map((value) => ({ value, label: t(`goals.trackingTypes.${value}`) }))}
        selected={v.tracking}
        onSelect={(tracking) => {
          if (tracking) set({ tracking: tracking as TrackingType, linkId: null })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'link'}
        title={t(`goals.trackingTypes.${v.tracking}`)}
        options={linkOptions}
        selected={v.linkId}
        onSelect={(linkId) => {
          if (linkId) set({ linkId })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'currency'}
        title={t('accounts.form.currency')}
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  flex: { flex: 1 },
  currency: { width: 120 },
})
