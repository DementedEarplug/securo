import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { formatCurrency } from '@/lib/format'
import { spacing } from '@/theme'
import { emptyLine, lineTotal, type LineValues } from './model'

/** Line items as stacked cards: a table of five columns doesn't fit a phone. */
export function LinesEditor({
  lines,
  onChange,
  currency,
  locale,
  showTax,
  /** At least one line must stay (schedules and price changes bill something). */
  required = false,
}: {
  lines: LineValues[]
  onChange: (lines: LineValues[]) => void
  currency: string
  locale: string
  showTax: boolean
  required?: boolean
}) {
  const { t } = useTranslation()
  const setLine = (index: number, patch: Partial<LineValues>) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))

  return (
    <View style={styles.root}>
      {lines.map((line, index) => {
        const total = lineTotal(line, locale)
        return (
          <Card key={index} style={styles.line}>
            <TextField
              label={t('invoices.field.lineDescription')}
              value={line.description}
              onChangeText={(description) => setLine(index, { description })}
              maxLength={500}
            />
            <View style={styles.row}>
              <View style={styles.flex}>
                <TextField
                  label={t('invoices.column.quantity')}
                  value={line.quantity}
                  onChangeText={(quantity) => setLine(index, { quantity })}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.flex}>
                <TextField
                  label={t('invoices.field.unit')}
                  value={line.unit}
                  onChangeText={(unit) => setLine(index, { unit })}
                  placeholder={t('invoices.field.unitPlaceholder')}
                  maxLength={20}
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.flex}>
                <TextField
                  label={t('invoices.field.unitPrice')}
                  value={line.unitPrice}
                  onChangeText={(unitPrice) => setLine(index, { unitPrice })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
              </View>
              {showTax ? (
                <View style={styles.flex}>
                  <TextField
                    label={`${t('invoices.field.taxRate')} (%)`}
                    value={line.taxRate}
                    onChangeText={(taxRate) => setLine(index, { taxRate })}
                    keyboardType="decimal-pad"
                  />
                </View>
              ) : null}
            </View>
            <View style={styles.footer}>
              <Text variant="caption" tone="muted" style={styles.flex}>
                {total === null ? ' ' : t('invoices.form.lineTotal', { amount: formatCurrency(total, currency, locale) })}
              </Text>
              {required && lines.length <= 1 ? null : (
                <Button label={t('invoices.form.removeLine')} variant="ghost" onPress={() => onChange(lines.filter((_, i) => i !== index))} />
              )}
            </View>
          </Card>
        )
      })}
      <Button label={t('invoices.field.addLine')} variant="secondary" onPress={() => onChange([...lines, emptyLine()])} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  line: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  flex: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center' },
})
