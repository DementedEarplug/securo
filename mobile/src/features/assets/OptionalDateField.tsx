import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { DateField } from '@/components/DateField'
import { PickerField } from '@/components/PickerField'
import { toIsoDate } from '@/lib/dates'
import { spacing } from '@/theme'

/** A date that may be left empty: tap to set (today), "Clear" to empty it again. */
export function OptionalDateField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
}) {
  const { t } = useTranslation()
  if (!value) {
    return <PickerField label={label} value={null} placeholder={placeholder ?? t('assets.noDate')} onPress={() => onChange(toIsoDate(new Date()))} />
  }
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <DateField label={label} value={value} onChange={onChange} />
      </View>
      <Button label={t('assets.clear')} variant="ghost" onPress={() => onChange(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  flex: { flex: 1 },
})
