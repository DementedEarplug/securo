import ChevronDown from 'lucide-react-native/icons/chevron-down'
import ChevronRight from 'lucide-react-native/icons/chevron-right'
import CircleAlert from 'lucide-react-native/icons/circle-alert'
import Wrench from 'lucide-react-native/icons/wrench'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native'

import { Text } from '@/components/Text'
import { font, radius, spacing, useColors } from '@/theme'
import type { ToolRun } from './turns'

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

/** Server tool names can carry a `server__` prefix; show the tool itself. */
export function toolLabel(name: string): string {
  return name.split('__').pop() ?? name
}

/** A tool the agent called: spinner while it runs, tap for arguments and result. */
export function ToolChip({ tool }: { tool: ToolRun }) {
  const { t } = useTranslation()
  const colors = useColors()
  const [open, setOpen] = useState(false)
  const pending = !tool.result
  const failed = tool.result && tool.result.ok === false
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <View style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('agents.tool.a11y', { name: toolLabel(tool.name) })}
        onPress={() => setOpen((v) => !v)}
        style={styles.header}
      >
        {pending ? (
          <ActivityIndicator size="small" color={colors.mutedForeground} />
        ) : failed ? (
          <CircleAlert size={14} color={colors.destructive} />
        ) : (
          <Wrench size={14} color={colors.mutedForeground} />
        )}
        <Text variant="caption" tone={failed ? 'destructive' : 'muted'} style={styles.name} numberOfLines={1}>
          {pending ? t('agents.tool.running', { name: toolLabel(tool.name) }) : toolLabel(tool.name)}
        </Text>
        <Chevron size={14} color={colors.mutedForeground} />
      </Pressable>
      {open ? (
        <View style={[styles.details, { borderTopColor: colors.border }]}>
          <Text variant="caption" tone="muted">
            {t('agents.tool.arguments')}
          </Text>
          <ScrollView horizontal>
            <RNText style={[styles.code, { color: colors.foreground }]}>{pretty(tool.args)}</RNText>
          </ScrollView>
          {tool.result ? (
            <>
              <Text variant="caption" tone="muted">
                {t('agents.tool.result')}
              </Text>
              <ScrollView horizontal>
                <RNText style={[styles.code, { color: colors.foreground }]} numberOfLines={40}>
                  {pretty(tool.result.data ?? tool.result.text ?? null)}
                </RNText>
              </ScrollView>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  name: { flex: 1, fontFamily: 'monospace' },
  details: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.xs },
  code: { fontFamily: 'monospace', fontSize: font.xs - 1, lineHeight: 16 },
})
