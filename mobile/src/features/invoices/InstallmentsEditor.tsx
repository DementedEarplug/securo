import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { DateField } from '@/components/DateField'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { formatCurrency } from '@/lib/format'
import { radius, spacing, useColors } from '@/theme'
import { addMonths, installmentsTotal, splitEvenly, type InstallmentValues } from './model'

const SPLITS = [2, 3, 4, 6, 12]

/**
 * The dates the money is expected on, when there is more than one. Off by
 * default and one switch away; on, it is a list seeded by "split in N" with
 * a running check against the total, as on the web.
 */
export function InstallmentsEditor({
  value,
  onChange,
  total,
  currency,
  locale,
  firstDueDate,
}: {
  value: InstallmentValues[] | null
  onChange: (value: InstallmentValues[] | null) => void
  total: number
  currency: string
  locale: string
  /** Where "split in N" starts counting from: the invoice's due date. */
  firstDueDate: string
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const rows = value ?? []
  const scheduled = installmentsTotal(rows, locale)
  const mismatch = value !== null && Math.abs(scheduled - total) >= 0.005
  const money = (n: number) => formatCurrency(n, currency, locale)
  const update = (index: number, patch: Partial<InstallmentValues>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  return (
    <View style={styles.root}>
      <SwitchField
        label={t('invoices.installments.title')}
        value={value !== null}
        onChange={(on) => onChange(on ? splitEvenly(total, 2, firstDueDate, locale) : null)}
      />
      {value !== null ? (
        <>
          <Text variant="caption" tone="muted">
            {`${t('invoices.installments.splitIn')} · ${t('invoices.installments.splitHint')}`}
          </Text>
          <View style={styles.splits}>
            {SPLITS.map((n) => (
              <Pressable
                key={n}
                accessibilityRole="button"
                accessibilityLabel={`${t('invoices.installments.splitIn')} ${n}`}
                onPress={() => onChange(splitEvenly(total, n, firstDueDate, locale))}
                style={[styles.split, { borderColor: colors.border, backgroundColor: colors.card }]}
              >
                <Text variant="label">{`${n}x`}</Text>
              </Pressable>
            ))}
          </View>
          {rows.map((row, index) => (
            <Card key={index} style={styles.row}>
              <TextField
                label={t('invoices.installments.label')}
                value={row.label}
                onChangeText={(label) => update(index, { label })}
                placeholder={t('invoices.installments.labelPlaceholder', { n: index + 1, total: rows.length })}
                maxLength={60}
              />
              <View style={styles.pair}>
                <View style={styles.flex}>
                  <DateField label={t('invoices.column.due')} value={row.dueDate} onChange={(dueDate) => update(index, { dueDate })} />
                </View>
                <View style={styles.flex}>
                  <TextField
                    label={t('invoices.column.amount')}
                    value={row.amount}
                    onChangeText={(amount) => update(index, { amount })}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              {rows.length > 2 ? (
                <Button label={t('common.delete')} variant="ghost" onPress={() => onChange(rows.filter((_, i) => i !== index))} />
              ) : null}
            </Card>
          ))}
          <Button
            label={t('invoices.installments.add')}
            variant="secondary"
            onPress={() =>
              onChange([...rows, { label: '', dueDate: addMonths(rows[rows.length - 1]?.dueDate ?? firstDueDate, 1), amount: '0' }])
            }
          />
          <Text variant="caption" tone={mismatch ? 'destructive' : 'muted'}>
            {mismatch
              ? t('invoices.installments.mismatch', { scheduled: money(scheduled), total: money(total) })
              : t('invoices.installments.addsUp', { total: money(total) })}
          </Text>
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  splits: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  split: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },
  row: { gap: spacing.md },
  pair: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  flex: { flex: 1 },
})
