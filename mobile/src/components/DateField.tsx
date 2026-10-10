import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'

import { useDisplayFormat } from '@/features/session/hooks'
import { formatDate, fromIsoDate, toIsoDate } from '@/lib/dates'
import { PickerField } from './PickerField'

/** A `yyyy-MM-dd` value edited with Android's date dialog. */
export function DateField({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string | null
}) {
  const { dateLocale } = useDisplayFormat()
  return (
    <PickerField
      label={label}
      value={formatDate(value, dateLocale)}
      placeholder={label}
      error={error}
      onPress={() =>
        DateTimePickerAndroid.open({
          value: fromIsoDate(value),
          mode: 'date',
          onChange: (event, date) => {
            if (event.type === 'set' && date) onChange(toIsoDate(date))
          },
        })
      }
    />
  )
}
