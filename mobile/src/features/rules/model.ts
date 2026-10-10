import type { components } from '@/api/schema'

type Schemas = components['schemas']

/** Condition fields and operators, as the web's rule editor offers them. */
export const CONDITION_FIELDS = ['description', 'payee', 'notes', 'amount', 'type', 'account_id', 'payee_id', 'date', 'status'] as const
export type ConditionField = (typeof CONDITION_FIELDS)[number]

const STRING_OPS = ['contains', 'not_contains', 'equals', 'not_equals', 'starts_with', 'ends_with', 'regex']
const NUMERIC_OPS = ['equals', 'gt', 'gte', 'lt', 'lte']

export function opsForField(field: string): string[] {
  if (field === 'amount' || field === 'date') return NUMERIC_OPS
  if (field === 'type') return ['equals']
  if (field === 'payee_id' || field === 'account_id' || field === 'status') return ['equals', 'not_equals']
  return STRING_OPS
}

function defaultValueForField(field: string): string {
  if (field === 'type') return 'debit'
  if (field === 'status') return 'pending'
  return ''
}

export interface Leaf {
  field: string
  op: string
  value: string
}

export interface Group {
  op: 'and' | 'or'
  conditions: Leaf[]
}

export type Node = Leaf | Group

export function isGroup(node: Node): node is Group {
  return 'conditions' in node
}

export function newLeaf(): Leaf {
  return { field: 'description', op: 'contains', value: '' }
}

/** Changing the field resets op and value, which may not fit the new field. */
export function changeField(leaf: Leaf, field: string): Leaf {
  return { field, op: opsForField(field)[0]!, value: defaultValueForField(field) }
}

export const ACTION_OPS = ['set_category', 'set_payee', 'set_description', 'append_notes', 'ignore'] as const
export type ActionOp = (typeof ACTION_OPS)[number]

export interface Action {
  op: ActionOp
  value: string
}

export function newAction(): Action {
  return { op: 'set_category', value: '' }
}

export interface RuleDraft {
  name: string
  conditionsOp: 'and' | 'or'
  conditions: Node[]
  actions: Action[]
  isActive: boolean
  priority: string
  overwriteExisting: boolean
}

export function draftFrom(rule?: Schemas['RuleRead']): RuleDraft {
  if (!rule) {
    return { name: '', conditionsOp: 'and', conditions: [newLeaf()], actions: [newAction()], isActive: true, priority: '0', overwriteExisting: false }
  }
  return {
    name: rule.name,
    conditionsOp: rule.conditions_op === 'or' ? 'or' : 'and',
    conditions: (rule.conditions as unknown as Node[]).map((node) =>
      isGroup(node)
        ? { op: node.op === 'and' ? 'and' : 'or', conditions: node.conditions.map((c) => ({ ...c, value: String(c.value ?? '') })) }
        : { ...node, value: String(node.value ?? '') },
    ),
    actions: (rule.actions as unknown as Action[]).map((a) => ({ op: a.op, value: String(a.value ?? '') })),
    isActive: rule.is_active,
    priority: String(rule.priority ?? 0),
    overwriteExisting: false,
  }
}

/** Why the rule can't be saved (i18n key), or null. The server rejects blank values and empty groups. */
export function ruleError(draft: RuleDraft): string | null {
  if (!draft.name.trim()) return 'rules.errors.name'
  if (draft.conditions.length === 0) return 'rules.errors.noConditions'
  const leaves = draft.conditions.flatMap((n) => (isGroup(n) ? n.conditions : [n]))
  if (draft.conditions.some((n) => isGroup(n) && n.conditions.length === 0)) return 'rules.errors.emptyGroup'
  if (leaves.some((l) => !l.value.trim())) return 'rules.errors.blankValue'
  if (draft.actions.length === 0) return 'rules.errors.noActions'
  if (draft.actions.some((a) => a.op !== 'ignore' && !a.value.trim())) return 'rules.errors.blankAction'
  if (!/^-?\d+$/.test(draft.priority.trim())) return 'rules.errors.priority'
  return null
}

function leafBody(leaf: Leaf) {
  // Amounts are compared as numbers on the server.
  const value = leaf.field === 'amount' ? Number(leaf.value.replace(',', '.')) : leaf.value.trim()
  return { field: leaf.field, op: leaf.op, value }
}

export function toRuleBody(draft: RuleDraft) {
  return {
    name: draft.name.trim(),
    conditions_op: draft.conditionsOp,
    conditions: draft.conditions.map((node) =>
      isGroup(node) ? { op: node.op, conditions: node.conditions.map(leafBody) } : leafBody(node),
    ) as Schemas['RuleCreate']['conditions'],
    actions: draft.actions.map((a) => ({ op: a.op, value: a.op === 'ignore' ? '' : a.value.trim() })),
    is_active: draft.isActive,
    priority: Number(draft.priority),
    overwrite_existing_categories: draft.overwriteExisting,
  }
}
