import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { DateField } from '@/components/DateField'
import { PickerField } from '@/components/PickerField'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SelectSheet } from '@/components/SelectSheet'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { spacing } from '@/theme'
import { FREQUENCIES, installmentCount, type Frequency, type Repeat } from './repeat'

/** "Repeat" options for a new transaction: installments or a recurring bill. */
export function RepeatSection({ value, onChange, defaultEndDate }: { value: Repeat; onChange: (value: Repeat) => void; defaultEndDate: string }) {
  const { t } = useTranslation()
  const [choosingFrequency, setChoosingFrequency] = useState(false)
  const frequency = value.kind === 'none' ? 'monthly' : value.frequency

  const setKind = (kind: Repeat['kind']) => {
    if (kind === 'none') onChange({ kind: 'none' })
    else if (kind === 'installments') onChange({ kind: 'installments', count: '12', frequency })
    else onChange({ kind: 'recurring', frequency, endDate: null })
  }

  return (
    <View style={styles.section}>
      <Text variant="label" tone="muted">
        {t('transactions.repeat.title')}
      </Text>
      <SegmentedControl
        value={value.kind}
        onChange={setKind}
        options={[
          { value: 'none', label: t('transactions.repeat.none') },
          { value: 'installments', label: t('transactions.repeat.installments') },
          { value: 'recurring', label: t('transactions.repeat.recurring') },
        ]}
      />
      {value.kind === 'installments' ? (
        <TextField
          label={t('transactions.repeat.count')}
          value={value.count}
          onChangeText={(count) => onChange({ ...value, count: count.replace(/\D/g, '') })}
          keyboardType="number-pad"
          maxLength={3}
          error={installmentCount(value.count) === null ? t('transactions.repeat.countInvalid') : null}
        />
      ) : null}
      {value.kind !== 'none' ? (
        <>
          <PickerField
            label={t('transactions.repeat.frequency')}
            value={t(`common.frequencies.${frequency}`)}
            placeholder={t('transactions.repeat.frequency')}
            onPress={() => setChoosingFrequency(true)}
          />
          <SelectSheet
            visible={choosingFrequency}
            title={t('transactions.repeat.frequency')}
            options={FREQUENCIES.map((f) => ({ value: f, label: t(`common.frequencies.${f}`) }))}
            selected={frequency}
            onSelect={(f) => {
              setChoosingFrequency(false)
              if (f) onChange({ ...value, frequency: f as Frequency })
            }}
            onClose={() => setChoosingFrequency(false)}
          />
        </>
      ) : null}
      {value.kind === 'recurring' ? (
        value.endDate ? (
          <DateField label={t('transactions.repeat.endDate')} value={value.endDate} onChange={(endDate) => onChange({ ...value, endDate })} />
        ) : (
          <PickerField
            label={t('transactions.repeat.endDate')}
            value={null}
            placeholder={t('transactions.repeat.noEnd')}
            onPress={() => onChange({ ...value, endDate: defaultEndDate })}
          />
        )
      ) : null}
      {value.kind === 'installments' ? (
        <Text variant="caption" tone="muted">
          {t('transactions.repeat.installmentsHint')}
        </Text>
      ) : value.kind === 'recurring' ? (
        <Text variant="caption" tone="muted">
          {t('transactions.repeat.recurringHint')}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
})
