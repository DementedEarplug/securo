import Check from 'lucide-react-native/icons/check'
import ChevronDown from 'lucide-react-native/icons/chevron-down'
import ChevronRight from 'lucide-react-native/icons/chevron-right'
import CircleAlert from 'lucide-react-native/icons/circle-alert'
import Sparkles from 'lucide-react-native/icons/sparkles'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native'

import { Button } from '@/components/Button'
import { Text } from '@/components/Text'
import { useCanWrite, useDisplayFormat } from '@/features/session/hooks'
import { showError } from '@/lib/confirm'
import { errorMessage } from '@/lib/errors'
import { font, radius, spacing, useColors } from '@/theme'
import { useApplyProposal, useAppliedProposals } from './hooks'
import type { ProposalData } from './proposals'
import { proposalSplits, proposalSummary, proposalTitle } from './summary'

/**
 * Something the agent proposes to change. Nothing happens until the user taps
 * Apply, which calls the regular API (so the usual permissions apply).
 */
export function ProposalCard({ toolCallId, data }: { toolCallId: string; data: ProposalData }) {
  const { t } = useTranslation()
  const colors = useColors()
  const canWrite = useCanWrite()
  const { currency, locale } = useDisplayFormat()
  const applied = Boolean(useAppliedProposals().data?.[toolCallId])
  const apply = useApplyProposal()
  const [showRaw, setShowRaw] = useState(false)

  if (data.error) {
    return (
      <View style={[styles.card, styles.row, { borderColor: colors.destructive, backgroundColor: colors.card }]}>
        <CircleAlert size={16} color={colors.destructive} />
        <Text variant="caption" tone="destructive" style={styles.flex}>
          {data.error}
        </Text>
      </View>
    )
  }
  if (!data.kind) return null

  const splits = proposalSplits(data, currency, locale)
  const accent = applied ? colors.income : colors.warning
  const onApply = () =>
    apply.mutate({ toolCallId, data }, { onError: (e) => showError(errorMessage(e, t) || t('agents.proposal.applyFailed')) })
  const Chevron = showRaw ? ChevronDown : ChevronRight

  return (
    <View style={[styles.card, { borderColor: accent, backgroundColor: colors.card }]}>
      <View style={styles.body}>
        <View style={styles.row}>
          {applied ? <Check size={16} color={accent} /> : <Sparkles size={16} color={accent} />}
          <Text variant="label" style={styles.flex}>
            {proposalTitle(data.kind, t)}
          </Text>
          <Text variant="caption" style={[styles.badge, { color: accent, borderColor: accent }]}>
            {applied ? t('agents.proposal.applied') : t('agents.proposal.label')}
          </Text>
        </View>
        <Text variant="caption" tone="muted">
          {proposalSummary(data, t, currency, locale)}
        </Text>
        {splits ? (
          <View style={[styles.splits, { borderColor: colors.border }]}>
            <Text variant="caption" tone="muted">
              {[splits.group, splits.shareType].filter(Boolean).join(' · ')}
            </Text>
            {splits.lines.map((line, i) => (
              <View key={i} style={styles.row}>
                <Text variant="caption" style={styles.flex}>
                  {line.name}
                </Text>
                <Text variant="caption">{line.pct != null ? `${line.amount} (${line.pct}%)` : line.amount}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {applied ? null : canWrite ? (
          <Button label={t('agents.proposal.apply')} onPress={onApply} loading={apply.isPending} />
        ) : (
          <Text variant="caption" tone="muted">
            {t('agents.proposal.readOnly')}
          </Text>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showRaw }}
        onPress={() => setShowRaw((v) => !v)}
        style={[styles.row, styles.rawToggle, { borderTopColor: colors.border }]}
      >
        <Chevron size={12} color={colors.mutedForeground} />
        <Text variant="caption" tone="muted">
          {t('agents.proposal.showRaw')}
        </Text>
      </Pressable>
      {showRaw ? (
        <ScrollView horizontal style={[styles.raw, { borderTopColor: colors.border }]}>
          <RNText style={[styles.code, { color: colors.foreground }]}>{JSON.stringify(data, null, 2)}</RNText>
        </ScrollView>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  body: { padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  badge: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 1, fontSize: 10, letterSpacing: 0.5 },
  splits: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, padding: spacing.sm, gap: 2 },
  rawToggle: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  raw: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.md },
  code: { fontFamily: 'monospace', fontSize: font.xs - 1, lineHeight: 16 },
})
