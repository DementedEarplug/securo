import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Pressable, StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { DateField } from '@/components/DateField'
import { Icon } from '@/components/Icon'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SelectSheet, type SelectOption } from '@/components/SelectSheet'
import { Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { accountNameById, accountOptions, useAccounts } from '@/features/accounts/hooks'
import { usePayees } from '@/features/payees/hooks'
import { previewRule, useDeleteRule, useRules, useSaveRule, type Rule, type RulePreview } from '@/features/rules/hooks'
import {
  ACTION_OPS,
  CONDITION_FIELDS,
  changeField,
  draftFrom,
  isGroup,
  newAction,
  newLeaf,
  opsForField,
  ruleError,
  toRuleBody,
  type Action,
  type Leaf,
  type Node,
  type RuleDraft,
} from '@/features/rules/model'
import { useDisplayFormat } from '@/features/session/hooks'
import { categoryOptions } from '@/features/transactions/category-options'
import { useCategoryGroups } from '@/features/transactions/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { formatDate, toIsoDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { radius, spacing, useColors } from '@/theme'

/** Where a picker writes: a condition (top-level or inside a group) or an action. */
type Target =
  | { kind: 'field' | 'op' | 'value'; node: number; leaf?: number }
  | { kind: 'actionOp' | 'actionValue'; action: number }

export default function RuleFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const rules = useRules()
  if (id && rules.isPending) return <Loading />
  return <RuleForm rule={id ? rules.data?.find((r) => r.id === id) : undefined} />
}

function RuleForm({ rule }: { rule?: Rule }) {
  const { t } = useTranslation()
  const colors = useColors()
  const { dateLocale } = useDisplayFormat()
  const accounts = useAccounts({ includeClosed: true }).data ?? []
  const payees = usePayees().data ?? []
  const categories = categoryOptions(useCategoryGroups().data)
  const save = useSaveRule()
  const remove = useDeleteRule()
  const [draft, setDraft] = useState<RuleDraft>(() => draftFrom(rule))
  const [target, setTarget] = useState<Target | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<RulePreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const set = (patch: Partial<RuleDraft>) => {
    setDraft({ ...draft, ...patch })
    setPreview(null)
  }

  const getLeaf = (node: number, leaf?: number): Leaf => {
    const n = draft.conditions[node]!
    return isGroup(n) ? n.conditions[leaf ?? 0]! : n
  }
  const setLeaf = (node: number, leaf: number | undefined, next: Leaf) => {
    const conditions = draft.conditions.map((n, i) => {
      if (i !== node) return n
      return isGroup(n) ? { ...n, conditions: n.conditions.map((l, j) => (j === leaf ? next : l)) } : next
    })
    set({ conditions })
  }
  const removeLeaf = (node: number, leaf?: number) => {
    const n = draft.conditions[node]!
    if (isGroup(n) && leaf !== undefined) {
      set({ conditions: draft.conditions.map((x, i) => (i === node && isGroup(x) ? { ...x, conditions: x.conditions.filter((_, j) => j !== leaf) } : x)) })
    } else {
      set({ conditions: draft.conditions.filter((_, i) => i !== node) })
    }
  }
  const setAction = (index: number, next: Action) => set({ actions: draft.actions.map((a, i) => (i === index ? next : a)) })

  const fieldLabel = (field: string) => t(`rules.fields.${field}`, { defaultValue: field })
  const opLabel = (op: string) => t(`rules.ops.${op}`, { defaultValue: op })

  const valueLabel = (leaf: Leaf) => {
    if (leaf.field === 'account_id') return accountNameById(accounts, leaf.value)
    if (leaf.field === 'payee_id') return payees.find((p) => p.id === leaf.value)?.name ?? null
    return leaf.value || null
  }
  const actionValueLabel = (action: Action) => {
    if (action.op === 'set_category') return categories.find((c) => c.value === action.value)?.label ?? null
    if (action.op === 'set_payee') return payees.find((p) => p.id === action.value)?.name ?? null
    return action.value || null
  }

  const runPreview = async () => {
    const problem = ruleError({ ...draft, name: draft.name || '-' })
    if (problem) return setError(t(problem))
    setError(null)
    setPreviewing(true)
    try {
      const { name: _name, priority: _priority, ...body } = toRuleBody({ ...draft, name: draft.name || '-' })
      setPreview(await previewRule({ ...body, limit: 10, offset: 0 }))
    } catch (e) {
      setError(errorMessage(e, t))
    } finally {
      setPreviewing(false)
    }
  }

  const submit = async () => {
    const problem = ruleError(draft)
    if (problem) return setError(t(problem))
    setError(null)
    try {
      // New rules also sort out existing transactions; edits only when they change what matches.
      const result = await save.mutateAsync({ id: rule?.id, body: { ...toRuleBody(draft), ...(rule ? {} : { apply_to_existing: true }) } })
      if (result.applied_count) Alert.alert(t('rules.appliedTitle'), t('rules.appliedBody', { count: result.applied_count }))
      router.back()
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const confirmDelete = async () => {
    if (!rule || !(await confirmDestructive(t('rules.deleteTitle'), t('rules.deleteBody', { name: rule.name })))) return
    try {
      await remove.mutateAsync(rule.id)
      router.back()
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  const leafEditor = (leaf: Leaf, node: number, leafIndex?: number) => (
    <View key={`${node}-${leafIndex ?? 'x'}`} style={[styles.condition, { borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <PickerField label={t('rules.field')} value={fieldLabel(leaf.field)} placeholder="" onPress={() => setTarget({ kind: 'field', node, leaf: leafIndex })} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('rules.removeCondition')} onPress={() => removeLeaf(node, leafIndex)} hitSlop={10} style={styles.remove}>
          <Icon name="close" color={colors.mutedForeground} size={20} />
        </Pressable>
      </View>
      {opsForField(leaf.field).length > 1 ? (
        <PickerField label={t('rules.op')} value={opLabel(leaf.op)} placeholder="" onPress={() => setTarget({ kind: 'op', node, leaf: leafIndex })} />
      ) : null}
      {leaf.field === 'type' || leaf.field === 'status' ? (
        <SegmentedControl
          value={leaf.value}
          onChange={(value) => setLeaf(node, leafIndex, { ...leaf, value })}
          options={(leaf.field === 'type' ? ['debit', 'credit'] : ['pending', 'posted']).map((value) => ({
            value,
            label: t(leaf.field === 'type' ? (value === 'debit' ? 'transactions.expense' : 'transactions.income') : `transactions.${value}`),
          }))}
        />
      ) : leaf.field === 'account_id' || leaf.field === 'payee_id' ? (
        <PickerField label={t('rules.value')} value={valueLabel(leaf)} placeholder={t('rules.choose')} onPress={() => setTarget({ kind: 'value', node, leaf: leafIndex })} />
      ) : leaf.field === 'date' ? (
        leaf.value ? (
          <DateField label={t('rules.value')} value={leaf.value} onChange={(value) => setLeaf(node, leafIndex, { ...leaf, value })} />
        ) : (
          <PickerField label={t('rules.value')} value={null} placeholder={t('rules.choose')} onPress={() => setLeaf(node, leafIndex, { ...leaf, value: toIsoDate(new Date()) })} />
        )
      ) : (
        <TextField
          label={t('rules.value')}
          value={leaf.value}
          onChangeText={(value) => setLeaf(node, leafIndex, { ...leaf, value })}
          keyboardType={leaf.field === 'amount' ? 'decimal-pad' : 'default'}
          autoCapitalize="none"
        />
      )}
    </View>
  )

  // Options for whichever picker is open.
  let sheet: { title: string; options: SelectOption[]; selected: string | null } | null = null
  if (target?.kind === 'field') sheet = { title: t('rules.field'), options: CONDITION_FIELDS.map((f) => ({ value: f, label: fieldLabel(f) })), selected: getLeaf(target.node, target.leaf).field }
  if (target?.kind === 'op') {
    const leaf = getLeaf(target.node, target.leaf)
    sheet = { title: t('rules.op'), options: opsForField(leaf.field).map((op) => ({ value: op, label: opLabel(op) })), selected: leaf.op }
  }
  if (target?.kind === 'value') {
    const leaf = getLeaf(target.node, target.leaf)
    sheet = {
      title: fieldLabel(leaf.field),
      options: leaf.field === 'account_id' ? accountOptions(accounts) : payees.map((p) => ({ value: p.id, label: p.name })),
      selected: leaf.value || null,
    }
  }
  if (target?.kind === 'actionOp') sheet = { title: t('rules.action'), options: ACTION_OPS.map((op) => ({ value: op, label: t(`rules.actions.${op}`) })), selected: draft.actions[target.action]!.op }
  if (target?.kind === 'actionValue') {
    const action = draft.actions[target.action]!
    sheet = {
      title: t(`rules.actions.${action.op}`),
      options: action.op === 'set_category' ? categories : payees.map((p) => ({ value: p.id, label: p.name })),
      selected: action.value || null,
    }
  }

  const onPick = (value: string | null) => {
    if (!target || !value) return setTarget(null)
    if (target.kind === 'field') setLeaf(target.node, target.leaf, changeField(getLeaf(target.node, target.leaf), value))
    if (target.kind === 'op') setLeaf(target.node, target.leaf, { ...getLeaf(target.node, target.leaf), op: value })
    if (target.kind === 'value') setLeaf(target.node, target.leaf, { ...getLeaf(target.node, target.leaf), value })
    if (target.kind === 'actionOp') setAction(target.action, { op: value as Action['op'], value: '' })
    if (target.kind === 'actionValue') setAction(target.action, { ...draft.actions[target.action]!, value })
    setTarget(null)
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: rule ? t('rules.editTitle') : t('rules.newTitle') }} />
      <TextField label={t('groups.name')} value={draft.name} onChangeText={(name) => set({ name })} />

      <SectionHeader title={t('rules.when')} />
      <SegmentedControl
        value={draft.conditionsOp}
        onChange={(conditionsOp) => set({ conditionsOp })}
        options={[
          { value: 'and', label: t('rules.all') },
          { value: 'or', label: t('rules.any') },
        ]}
      />
      {draft.conditions.map((node: Node, index) =>
        isGroup(node) ? (
          <Card key={`g${index}`}>
            <View style={styles.row}>
              <Text variant="label" style={styles.flex}>
                {t('rules.group')}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t('rules.removeGroup')} onPress={() => removeLeaf(index)} hitSlop={10}>
                <Icon name="close" color={colors.mutedForeground} size={20} />
              </Pressable>
            </View>
            <SegmentedControl
              value={node.op}
              onChange={(op) => set({ conditions: draft.conditions.map((n, i) => (i === index && isGroup(n) ? { ...n, op } : n)) })}
              options={[
                { value: 'and', label: t('rules.all') },
                { value: 'or', label: t('rules.any') },
              ]}
            />
            {node.conditions.map((leaf, j) => leafEditor(leaf, index, j))}
            <Button
              label={t('rules.addCondition')}
              variant="ghost"
              onPress={() => set({ conditions: draft.conditions.map((n, i) => (i === index && isGroup(n) ? { ...n, conditions: [...n.conditions, newLeaf()] } : n)) })}
            />
          </Card>
        ) : (
          leafEditor(node, index)
        ),
      )}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button label={t('rules.addCondition')} variant="secondary" onPress={() => set({ conditions: [...draft.conditions, newLeaf()] })} />
        </View>
        <View style={styles.flex}>
          <Button
            label={t('rules.addGroup')}
            variant="ghost"
            onPress={() => set({ conditions: [...draft.conditions, { op: 'or', conditions: [newLeaf(), newLeaf()] }] })}
          />
        </View>
      </View>

      <SectionHeader title={t('rules.then')} />
      {draft.actions.map((action, index) => (
        <View key={index} style={[styles.condition, { borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <PickerField label={t('rules.action')} value={t(`rules.actions.${action.op}`)} placeholder="" onPress={() => setTarget({ kind: 'actionOp', action: index })} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('rules.removeAction')}
              onPress={() => set({ actions: draft.actions.filter((_, i) => i !== index) })}
              hitSlop={10}
              style={styles.remove}
            >
              <Icon name="close" color={colors.mutedForeground} size={20} />
            </Pressable>
          </View>
          {action.op === 'set_category' || action.op === 'set_payee' ? (
            <PickerField label={t('rules.value')} value={actionValueLabel(action)} placeholder={t('rules.choose')} onPress={() => setTarget({ kind: 'actionValue', action: index })} />
          ) : action.op === 'ignore' ? null : (
            <TextField label={t('rules.value')} value={action.value} onChangeText={(value) => setAction(index, { ...action, value })} />
          )}
        </View>
      ))}
      <Button label={t('rules.addAction')} variant="secondary" onPress={() => set({ actions: [...draft.actions, newAction()] })} />

      <SectionHeader title={t('rules.options')} />
      <SwitchField label={t('recurring.active')} value={draft.isActive} onChange={(isActive) => set({ isActive })} />
      <SwitchField label={t('rules.overwrite')} hint={t('rules.overwriteHint')} value={draft.overwriteExisting} onChange={(overwriteExisting) => set({ overwriteExisting })} />
      <TextField label={t('rules.priority')} value={draft.priority} onChangeText={(priority) => set({ priority: priority.replace(/[^\d-]/g, '') })} keyboardType="numbers-and-punctuation" />
      <Text variant="caption" tone="muted">
        {t('rules.priorityHint')}
      </Text>

      <Button label={t('rules.preview')} variant="secondary" onPress={runPreview} loading={previewing} />
      {preview ? (
        <Card>
          <Text variant="label">{t('rules.previewSummary', { matched: preview.matched, changed: preview.will_change })}</Text>
          {preview.sample.map((item) => (
            <View key={item.id} style={styles.sample}>
              <View style={styles.flex}>
                <Text numberOfLines={1}>{item.description}</Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {formatDate(item.date, dateLocale)}
                  {item.will_change && item.new_category_name ? ` · ${item.current_category_name ?? t('transactions.uncategorized')} → ${item.new_category_name}` : ''}
                </Text>
              </View>
              <AmountText variant="caption" value={item.type === 'debit' ? -Number(item.amount) : Number(item.amount)} currency={item.currency ?? undefined} />
            </View>
          ))}
        </Card>
      ) : null}

      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={save.isPending} />
      {rule ? <Button label={t('common.delete')} variant="ghost" onPress={confirmDelete} loading={remove.isPending} /> : null}

      <SelectSheet visible={sheet !== null} title={sheet?.title ?? ''} options={sheet?.options ?? []} selected={sheet?.selected ?? null} onSelect={onPick} onClose={() => setTarget(null)} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  condition: { gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md },
  remove: { paddingTop: spacing.lg },
  sample: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
})
