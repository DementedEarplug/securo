import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Switch, TextInput, View } from 'react-native'

import { PickerField } from '@/components/PickerField'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SelectSheet } from '@/components/SelectSheet'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { font, radius, spacing, useColors } from '@/theme'
import { useGroups } from './hooks'
import { NO_SPLIT, type ShareType, type SplitState } from './splits'

/** "Split with a group": who shares this transaction, and how. */
export function SplitSection({ value, onChange, error }: { value: SplitState; onChange: (value: SplitState) => void; error?: string | null }) {
  const { t } = useTranslation()
  const colors = useColors()
  const groups = (useGroups().data ?? []).filter((g) => !g.is_archived)
  const [choosing, setChoosing] = useState(false)
  const group = groups.find((g) => g.id === value.groupId)
  const enabled = value.groupId !== null

  if (groups.length === 0 && !enabled) return null

  const chooseGroup = (groupId: string) => {
    const members = groups.find((g) => g.id === groupId)?.members ?? []
    onChange({
      groupId,
      shareType: value.shareType,
      shares: Object.fromEntries(members.map((m) => [m.id, { included: true, value: '' }])),
    })
  }

  return (
    <View style={styles.section}>
      <SwitchField
        label={t('groups.split.title')}
        hint={t('groups.split.hint')}
        value={enabled}
        onChange={(on) => {
          if (!on) onChange(NO_SPLIT)
          else if (groups[0]) chooseGroup(groups[0].id)
        }}
      />
      {enabled ? (
        <>
          <PickerField label={t('groups.split.group')} value={group?.name ?? null} placeholder={t('groups.split.chooseGroup')} onPress={() => setChoosing(true)} />
          <SegmentedControl
            value={value.shareType}
            onChange={(shareType: ShareType) => onChange({ ...value, shareType })}
            options={[
              { value: 'equal', label: t('groups.split.equal') },
              { value: 'exact', label: t('groups.split.exact') },
              { value: 'percent', label: t('groups.split.percent') },
            ]}
          />
          {(group?.members ?? []).map((member) => {
            const share = value.shares[member.id] ?? { included: false, value: '' }
            const update = (patch: Partial<typeof share>) =>
              onChange({ ...value, shares: { ...value.shares, [member.id]: { ...share, ...patch } } })
            return (
              <View key={member.id} style={styles.member}>
                <Switch
                  accessibilityLabel={member.name}
                  value={share.included}
                  onValueChange={(included) => update({ included })}
                  trackColor={{ true: colors.primary, false: colors.muted }}
                />
                <Text style={styles.name} numberOfLines={1}>
                  {member.is_self ? t('groups.youName', { name: member.name }) : member.name}
                </Text>
                {value.shareType !== 'equal' && share.included ? (
                  <TextInput
                    accessibilityLabel={t('groups.split.shareFor', { name: member.name })}
                    value={share.value}
                    onChangeText={(text) => update({ value: text })}
                    keyboardType="decimal-pad"
                    placeholder={value.shareType === 'percent' ? '%' : '0'}
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.share, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                  />
                ) : null}
              </View>
            )
          })}
          {error ? (
            <Text variant="caption" tone="destructive">
              {t(error)}
            </Text>
          ) : null}
        </>
      ) : null}
      <SelectSheet
        visible={choosing}
        title={t('groups.split.group')}
        options={groups.map((g) => ({ value: g.id, label: g.name, color: g.color }))}
        selected={value.groupId}
        onSelect={(id) => {
          if (id) chooseGroup(id)
          setChoosing(false)
        }}
        onClose={() => setChoosing(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  name: { flex: 1 },
  share: { width: 96, minHeight: 40, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, fontSize: font.md, textAlign: 'right' },
})
