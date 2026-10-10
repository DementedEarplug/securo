import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button } from '@/components/Button'
import { DateField } from '@/components/DateField'
import { Icon } from '@/components/Icon'
import { ListRow } from '@/components/ListRow'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SelectSheet } from '@/components/SelectSheet'
import { Text } from '@/components/Text'
import { accountOptions, useAccounts } from '@/features/accounts/hooks'
import { useDisplayFormat } from '@/features/session/hooks'
import { toIsoDate } from '@/lib/dates'
import { radius, spacing, useColors } from '@/theme'
import { formatRange } from './buckets'
import { effectiveInterval, RANGE_PRESETS, resolveRange, validIntervals, type DateRange, type RangePreset } from './filters'
import { useReportFilters } from './ReportFiltersContext'

export interface ReportControlSet {
  range: boolean
  interval: boolean
  accounts: boolean
}

/** The range, interval and account filters a report uses, shared across reports. */
export function ReportControls({ controls }: { controls: ReportControlSet }) {
  const { t } = useTranslation()
  const { dateLocale } = useDisplayFormat()
  const { filters, setPreset, setCustomRange, setInterval, setAccountIds } = useReportFilters()
  const [sheet, setSheet] = useState<'range' | 'accounts' | null>(null)
  const accounts = useAccounts().data ?? []
  const range = resolveRange(filters)
  const intervals = validIntervals(range)
  const interval = effectiveInterval(filters, range)

  if (!controls.range && !controls.interval && !controls.accounts) return null

  const accountLabel = filters.accountIds.length
    ? t('reports.controls.accountsSelected', { count: filters.accountIds.length })
    : t('reports.controls.allAccounts')

  return (
    <View style={styles.root}>
      <View style={styles.chips}>
        {controls.range ? (
          <Chip
            label={t(`reports.presets.${filters.preset}`)}
            detail={formatRange(range, dateLocale)}
            onPress={() => setSheet('range')}
            accessibilityLabel={t('reports.controls.rangeA11y', { preset: t(`reports.presets.${filters.preset}`), range: formatRange(range, dateLocale) })}
          />
        ) : null}
        {controls.accounts ? (
          <Chip
            label={accountLabel}
            onPress={() => setSheet('accounts')}
            accessibilityLabel={t('reports.controls.accountsA11y', { value: accountLabel })}
            active={filters.accountIds.length > 0}
          />
        ) : null}
      </View>
      {controls.interval && intervals.length > 1 ? (
        <SegmentedControl
          options={intervals.map((value) => ({ value, label: t(`reports.intervals.${value}`) }))}
          value={interval}
          onChange={setInterval}
        />
      ) : null}
      <RangeSheet
        visible={sheet === 'range'}
        preset={filters.preset}
        custom={filters.preset === 'custom' ? range : null}
        onPreset={(preset) => {
          setPreset(preset)
          setSheet(null)
        }}
        onCustom={(next) => {
          setCustomRange(next)
          setSheet(null)
        }}
        onClose={() => setSheet(null)}
      />
      <SelectSheet
        visible={sheet === 'accounts'}
        title={t('reports.controls.accounts')}
        options={accountOptions(accounts)}
        selected={filters.accountIds}
        noneLabel={t('reports.controls.allAccounts')}
        onSelect={(id) => {
          if (id === null) return setAccountIds([])
          setAccountIds(filters.accountIds.includes(id) ? filters.accountIds.filter((a) => a !== id) : [...filters.accountIds, id])
        }}
        onClose={() => setSheet(null)}
      />
    </View>
  )
}

function Chip({
  label,
  detail,
  onPress,
  accessibilityLabel,
  active = false,
}: {
  label: string
  detail?: string
  onPress: () => void
  accessibilityLabel: string
  active?: boolean
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: colors.card }]}
    >
      <View style={styles.chipText}>
        <Text variant="label" tone={active ? 'primary' : 'default'} numberOfLines={1}>
          {label}
        </Text>
        {detail ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-right" color={colors.mutedForeground} size={16} />
    </Pressable>
  )
}

/** Presets plus a custom from/to, in a full-screen sheet. */
function RangeSheet({
  visible,
  preset,
  custom,
  onPreset,
  onCustom,
  onClose,
}: {
  visible: boolean
  preset: RangePreset
  custom: DateRange | null
  onPreset: (preset: RangePreset) => void
  onCustom: (range: DateRange) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const today = toIsoDate(new Date())
  const fallback = resolveRange({ preset: 'thisMonth', custom: { from: '', to: '' } })
  const [draft, setDraft] = useState<DateRange>(custom ?? fallback)
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.sheet, { backgroundColor: colors.background }]}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text variant="heading" style={styles.flex}>
            {t('reports.controls.range')}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={12}>
            <Icon name="close" color={colors.foreground} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody}>
          <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {RANGE_PRESETS.filter((p) => p !== 'custom').map((p) => (
              <ListRow
                key={p}
                title={t(`reports.presets.${p}`)}
                onPress={() => onPreset(p)}
                accessibilityLabel={`${t(`reports.presets.${p}`)}${p === preset ? `, ${t('common.selected')}` : ''}`}
                trailing={p === preset ? <Text tone="primary">✓</Text> : null}
              />
            ))}
          </View>
          <Text variant="label" tone="muted">
            {t('reports.presets.custom')}
          </Text>
          <DateField label={t('reports.controls.from')} value={draft.from} onChange={(from) => setDraft((d) => ({ ...d, from }))} />
          <DateField label={t('reports.controls.to')} value={draft.to} onChange={(to) => setDraft((d) => ({ ...d, to }))} />
          {error ? <Text tone="destructive">{error}</Text> : null}
          <Button
            label={t('reports.controls.applyCustom')}
            onPress={() => {
              if (draft.from > draft.to) return setError(t('reports.controls.fromAfterTo'))
              if (draft.to > today) return setError(t('reports.controls.futureEnd'))
              setError(null)
              onCustom(draft)
            }}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    maxWidth: '100%',
  },
  chipText: { flexShrink: 1 },
  sheet: { flex: 1 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetBody: { padding: spacing.lg, gap: spacing.md },
  list: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  flex: { flex: 1 },
})
