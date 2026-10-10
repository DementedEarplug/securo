import type { components } from '@/api/schema'

import type { Rule } from './hooks'

type Schemas = components['schemas']

/** How "the same vendor" is recognised: by payee, or by text in the description. */
export type SimilarMatch = { by: 'payee'; payeeId: string } | { by: 'description'; text: string }

export interface SimilarLeaf {
  field: 'payee_id' | 'description'
  op: 'equals' | 'contains'
  value: string
}

// Shorter text matches far too much ("SQ" is in every Square purchase).
export const MIN_MATCH_LENGTH = 3

/**
 * The part of a bank description that names the vendor: everything before the
 * first word carrying a digit, which is usually a store number, a date or a
 * reference ("STARBUCKS STORE 12345 SEATTLE" → "STARBUCKS STORE",
 * "AMZN Mktp US*2X4AB12" → "AMZN Mktp"). The first word is always kept, so
 * "7-ELEVEN 1234" stays "7-ELEVEN". Falls back to the whole text when that
 * would leave too little to match on.
 */
export function vendorKey(description: string): string {
  const full = description.trim().replace(/\s+/g, ' ')
  const words = full.split(' ')
  const kept: string[] = []
  for (const [i, word] of words.entries()) {
    if (i > 0 && /[\d#]/.test(word)) break
    kept.push(word)
  }
  const key = kept.join(' ').replace(/[\s*#\-–—:;,./|]+$/, '')
  return key.length >= MIN_MATCH_LENGTH ? key : full
}

/** The single condition a vendor rule matches on. */
export function similarCondition(match: SimilarMatch): SimilarLeaf {
  return match.by === 'payee'
    ? { field: 'payee_id', op: 'equals', value: match.payeeId }
    : { field: 'description', op: 'contains', value: match.text.trim() }
}

export function isUsableMatch(match: SimilarMatch): boolean {
  return match.by === 'payee' ? Boolean(match.payeeId) : match.text.trim().length >= MIN_MATCH_LENGTH
}

/** Same normalisation the rule engine uses: case- and accent-insensitive. */
function normalize(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * A rule that matches on exactly this one condition and sets a category: the
 * vendor rule made last time this vendor was recategorised. Updating it keeps
 * one rule per vendor instead of a pile of contradicting ones.
 */
export function findVendorRule(rules: Rule[], leaf: SimilarLeaf): Rule | null {
  return (
    rules.find((rule) => {
      const conditions = rule.conditions as Record<string, unknown>[]
      if (conditions.length !== 1) return false
      const only = conditions[0]!
      if ('conditions' in only) return false
      return (
        only.field === leaf.field &&
        only.op === leaf.op &&
        normalize(only.value) === normalize(leaf.value) &&
        (rule.actions as Record<string, unknown>[]).some((a) => a.op === 'set_category')
      )
    }) ?? null
  )
}

/**
 * Rules run from the lowest priority up and the first category wins, so the
 * vendor rule goes below every other rule: the most recent correction beats
 * broader rules and rule packs that also match this vendor.
 */
export function vendorRulePriority(rules: Rule[], except?: string): number {
  const others = rules.filter((r) => r.id !== except).map((r) => r.priority)
  return Math.min(0, ...others) - 1
}

export function vendorRuleName(vendor: string, category: string): string {
  return `${vendor} → ${category}`
}

/**
 * The new name for an updated vendor rule: one this screen named after its old
 * category follows the new one, while a name the user chose is left alone.
 */
export function renamedVendorRule(rule: Pick<Rule, 'name'>, vendor: string, category: string): string | undefined {
  const prefix = vendorRuleName(vendor, '')
  if (!rule.name.startsWith(prefix)) return undefined
  const next = vendorRuleName(vendor, category)
  return next === rule.name ? undefined : next
}

/** The category action replaced, every other action of an existing rule kept. */
export function withCategory(actions: Rule['actions'], categoryId: string): Schemas['RuleAction'][] {
  const rest = (actions as Schemas['RuleAction'][]).filter((a) => a.op !== 'set_category')
  return [{ op: 'set_category', value: categoryId }, ...rest]
}
