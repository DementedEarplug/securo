import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/Button'
import { DateField } from '@/components/DateField'
import { Screen } from '@/components/Screen'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useAddValue, useAsset } from '@/features/assets/hooks'
import { toValuePayload } from '@/features/assets/model'
import { useDisplayFormat } from '@/features/session/hooks'
import { toIsoDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'

/** Record what a manually valued asset is worth on a date (`?assetId=`). */
export default function AssetValueScreen() {
  const { assetId } = useLocalSearchParams<{ assetId: string }>()
  const { t } = useTranslation()
  const { locale } = useDisplayFormat()
  const asset = useAsset(assetId).data
  const add = useAddValue(assetId)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => toIsoDate(new Date()))
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const payload = toValuePayload(amount, date, locale)
    if (!payload.ok) return setError(t(payload.error.key, payload.error.params))
    setError(null)
    try {
      await add.mutateAsync(payload.value)
      router.back()
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('assets.addValue') }} />
      {asset ? <Text variant="heading">{asset.name}</Text> : null}
      <TextField
        label={asset ? t('assets.amountIn', { currency: asset.currency }) : t('assets.amount')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        autoFocus
      />
      <DateField label={t('assets.date')} value={date} onChange={setDate} />
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={add.isPending} />
    </Screen>
  )
}
