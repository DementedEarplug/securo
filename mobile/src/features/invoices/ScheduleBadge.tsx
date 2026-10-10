import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Text } from '@/components/Text'
import { radius, spacing, useColors } from '@/theme'
import { scheduleLabel, type Schedule } from './schedules'

/** Quiet unless something needs a person: paused after failures is the one loud state. */
export function ScheduleBadge({ schedule }: { schedule: Pick<Schedule, 'status' | 'pause_reason' | 'past_due_count'> }) {
  const { t } = useTranslation()
  const colors = useColors()
  const label = scheduleLabel(schedule)
  const tone =
    label === 'paused_failures' ? colors.expense : label === 'past_due' ? colors.warning : label === 'active' ? colors.income : colors.mutedForeground
  return (
    <View style={[styles.badge, { borderColor: tone }]}>
      <Text variant="caption" style={{ color: tone }}>
        {t(`invoices.schedules.state.${label}`)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 1, alignSelf: 'flex-start' },
})
