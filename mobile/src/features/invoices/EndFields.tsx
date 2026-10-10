import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { DateField } from '@/components/DateField'
import { PickerField } from '@/components/PickerField'
import { SelectSheet } from '@/components/SelectSheet'
import { TextField } from '@/components/TextField'
import { addMonths } from './model'
import { END_TYPES, localToday, type EndValues, type ScheduleEndType } from './schedules'

/** When an agreement ends: never, on a date, or after a number of invoices. */
export function EndFields({ value, onChange }: { value: EndValues; onChange: (patch: Partial<EndValues>) => void }) {
  const { t } = useTranslation()
  const [picking, setPicking] = useState(false)
  return (
    <View style={{ gap: 12 }}>
      <PickerField
        label={t('invoices.schedules.field.ends')}
        value={t(`invoices.schedules.endType.${value.endType}`)}
        placeholder=""
        onPress={() => setPicking(true)}
      />
      {value.endType === 'on_date' ? (
        <DateField
          label={t('invoices.schedules.field.endDate')}
          value={value.endDate ?? addMonths(localToday(), 12)}
          onChange={(endDate) => onChange({ endDate })}
        />
      ) : null}
      {value.endType === 'after_count' ? (
        <TextField
          label={t('invoices.schedules.field.endCount')}
          value={value.endCount}
          onChangeText={(endCount) => onChange({ endCount })}
          keyboardType="number-pad"
          maxLength={4}
        />
      ) : null}
      <SelectSheet
        visible={picking}
        title={t('invoices.schedules.field.ends')}
        options={END_TYPES.map((type) => ({ value: type, label: t(`invoices.schedules.endType.${type}`) }))}
        selected={value.endType}
        onSelect={(type) => {
          if (type) {
            const endType = type as ScheduleEndType
            // A date end needs a date before it can be sent; seed one a year out.
            onChange(endType === 'on_date' && !value.endDate ? { endType, endDate: addMonths(localToday(), 12) } : { endType })
          }
          setPicking(false)
        }}
        onClose={() => setPicking(false)}
      />
    </View>
  )
}
