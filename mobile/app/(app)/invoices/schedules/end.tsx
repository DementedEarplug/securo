import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/Button'
import { DateField } from '@/components/DateField'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SelectSheet } from '@/components/SelectSheet'
import { Text } from '@/components/Text'
import { useEndSchedule } from '@/features/invoices/hooks'
import { invoiceErrorMessage } from '@/features/invoices/model'
import { END_REASONS, localToday, type ScheduleEndReason } from '@/features/invoices/schedules'

/** End an agreement, and say why: the one thing its invoices can't tell you later. */
export default function EndScheduleScreen() {
  const { t } = useTranslation()
  const { scheduleId } = useLocalSearchParams<{ scheduleId: string }>()
  const end = useEndSchedule(scheduleId)
  const [reason, setReason] = useState<ScheduleEndReason>('canceled_by_client')
  const [endedAt, setEndedAt] = useState(localToday)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    try {
      await end.mutateAsync({ reason, ended_at: endedAt })
      router.back()
    } catch (e) {
      setError(invoiceErrorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Text variant="caption" tone="muted">
        {t('invoices.schedules.endDescription')}
      </Text>
      <PickerField
        label={t('invoices.schedules.field.endReason')}
        value={t(`invoices.schedules.endReason.${reason}`)}
        placeholder=""
        onPress={() => setPicking(true)}
      />
      <DateField label={t('invoices.schedules.field.endedAt')} value={endedAt} onChange={setEndedAt} />
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('invoices.schedules.action.end')} variant="destructive" onPress={submit} loading={end.isPending} />
      <SelectSheet
        visible={picking}
        title={t('invoices.schedules.field.endReason')}
        options={END_REASONS.map((value) => ({ value, label: t(`invoices.schedules.endReason.${value}`) }))}
        selected={reason}
        onSelect={(value) => {
          if (value) setReason(value as ScheduleEndReason)
          setPicking(false)
        }}
        onClose={() => setPicking(false)}
      />
    </Screen>
  )
}
