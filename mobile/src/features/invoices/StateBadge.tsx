import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Text } from '@/components/Text'
import { radius, spacing, useColors, type Colors } from '@/theme'
import type { InvoiceState } from './model'

/** How each derived state paints, quiet to loud, as on the web. */
function toneFor(state: InvoiceState, colors: Colors): string {
  switch (state) {
    case 'open':
      return colors.primary
    case 'partial':
      return colors.warning
    case 'paid':
      return colors.income
    case 'overdue':
      return colors.expense
    default:
      return colors.mutedForeground
  }
}

export function StateBadge({ state }: { state: InvoiceState }) {
  const { t } = useTranslation()
  const colors = useColors()
  const tone = toneFor(state, colors)
  return (
    <View style={[styles.badge, { borderColor: tone }]}>
      <Text variant="caption" style={[{ color: tone }, state === 'void' ? styles.void : null]}>
        {t(`invoices.state.${state}`)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 1, alignSelf: 'flex-start' },
  void: { textDecorationLine: 'line-through' },
})
