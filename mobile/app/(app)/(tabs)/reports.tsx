import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { Screen } from '@/components/Screen'
import { Text } from '@/components/Text'
import { findReport, REPORTS } from '@/features/reports/registry'
import { ReportControls } from '@/features/reports/ReportControls'
import { ReportFiltersProvider, useReportFilters } from '@/features/reports/ReportFiltersContext'
import { useWorkspaceKey } from '@/features/session/hooks'
import { radius, spacing, useColors } from '@/theme'

export default function ReportsScreen() {
  return (
    <ReportFiltersProvider>
      <Reports />
    </ReportFiltersProvider>
  )
}

function Reports() {
  const { t } = useTranslation()
  const colors = useColors()
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  const { filters, reportKey, setReportKey } = useReportFilters()
  const [refreshing, setRefreshing] = useState(false)
  const report = findReport(reportKey)
  const Report = report.Component

  const refresh = async () => {
    setRefreshing(true)
    try {
      await queryClient.invalidateQueries({ queryKey: [ws, 'reports'] })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.picker}
        style={[styles.pickerBar, { borderBottomColor: colors.border }]}
        accessibilityRole="tablist"
      >
        {REPORTS.map((r) => {
          const selected = r.key === report.key
          const Glyph = r.icon
          return (
            <Pressable
              key={r.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t(r.titleKey)}
              onPress={() => setReportKey(r.key)}
              style={[
                styles.tab,
                { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.accent : colors.card },
              ]}
            >
              <Glyph size={16} color={selected ? colors.primary : colors.mutedForeground} />
              <Text variant="label" tone={selected ? 'primary' : 'default'} numberOfLines={1}>
                {t(r.titleKey)}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
      <Screen onRefresh={() => void refresh()} refreshing={refreshing}>
        <ReportControls controls={report.controls} />
        <Report key={report.key} filters={filters} />
      </Screen>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pickerBar: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  picker: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    minHeight: 40,
  },
})
