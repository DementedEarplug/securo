import type { Rule } from './hooks'
import { findVendorRule, isUsableMatch, renamedVendorRule, similarCondition, vendorKey, vendorRuleName, vendorRulePriority, withCategory } from './similar'

function rule(overrides: Partial<Rule>): Rule {
  return {
    id: 'r1',
    user_id: 'u',
    name: 'Rule',
    conditions_op: 'and',
    conditions: [],
    actions: [{ op: 'set_category', value: 'old' }],
    priority: 0,
    is_active: true,
    ...overrides,
  } as Rule
}

describe('vendorKey', () => {
  it.each([
    ['STARBUCKS STORE 12345 SEATTLE WA', 'STARBUCKS STORE'],
    ['AMZN Mktp US*2X4AB12', 'AMZN Mktp'],
    ['NETFLIX.COM', 'NETFLIX.COM'],
    ['SQ *BLUE BOTTLE COFFEE', 'SQ *BLUE BOTTLE COFFEE'],
    ['7-ELEVEN 1234', '7-ELEVEN'],
    ['  TRADER   JOE S #552  ', 'TRADER JOE S'],
    ['SHELL OIL - 5744', 'SHELL OIL'],
  ])('%s → %s', (description, key) => {
    expect(vendorKey(description)).toBe(key)
  })

  it('keeps the whole text when the vendor part would be too short to match on', () => {
    expect(vendorKey('BP 8834 MAIN ST')).toBe('BP 8834 MAIN ST')
  })
})

describe('similarCondition', () => {
  it('matches a payee by id', () => {
    expect(similarCondition({ by: 'payee', payeeId: 'p1' })).toEqual({ field: 'payee_id', op: 'equals', value: 'p1' })
  })

  it('matches trimmed description text', () => {
    expect(similarCondition({ by: 'description', text: ' UBER ' })).toEqual({ field: 'description', op: 'contains', value: 'UBER' })
  })

  it('refuses text too short to be specific', () => {
    expect(isUsableMatch({ by: 'description', text: ' SQ ' })).toBe(false)
    expect(isUsableMatch({ by: 'description', text: 'UBER' })).toBe(true)
    expect(isUsableMatch({ by: 'payee', payeeId: '' })).toBe(false)
  })
})

describe('findVendorRule', () => {
  const leaf = { field: 'description', op: 'contains', value: 'Café Uber' } as const

  it('finds the rule matching exactly this vendor, ignoring case and accents', () => {
    const match = rule({ id: 'mine', conditions: [{ field: 'description', op: 'contains', value: 'CAFE UBER' }] })
    expect(findVendorRule([match], leaf)?.id).toBe('mine')
  })

  it('skips rules with more conditions, groups, other operators or no category', () => {
    const rules = [
      rule({ conditions: [leaf, { field: 'type', op: 'equals', value: 'debit' }] }),
      rule({ conditions: [{ op: 'or', conditions: [leaf] }] }),
      rule({ conditions: [{ ...leaf, op: 'starts_with' }] }),
      rule({ conditions: [leaf], actions: [{ op: 'ignore', value: true }] }),
    ]
    expect(findVendorRule(rules, leaf)).toBeNull()
  })
})

describe('vendorRulePriority', () => {
  it('goes below every other rule so the newest correction wins', () => {
    expect(vendorRulePriority([])).toBe(-1)
    expect(vendorRulePriority([rule({ priority: 10 }), rule({ priority: 50 })])).toBe(-1)
    expect(vendorRulePriority([rule({ id: 'a', priority: -3 }), rule({ id: 'b', priority: 5 })])).toBe(-4)
  })

  it('ignores the rule being updated', () => {
    expect(vendorRulePriority([rule({ id: 'a', priority: -3 }), rule({ id: 'b', priority: -1 })], 'a')).toBe(-2)
  })
})

describe('withCategory', () => {
  it('replaces the category and keeps the rule’s other actions', () => {
    const actions = [
      { op: 'set_category', value: 'old' },
      { op: 'append_notes', value: '#coffee' },
    ]
    expect(withCategory(actions, 'new')).toEqual([
      { op: 'set_category', value: 'new' },
      { op: 'append_notes', value: '#coffee' },
    ])
  })
})

it('names the rule after the vendor and category', () => {
  expect(vendorRuleName('STARBUCKS', 'Coffee')).toBe('STARBUCKS → Coffee')
})

describe('renamedVendorRule', () => {
  it('follows the new category when the app named the rule', () => {
    expect(renamedVendorRule({ name: 'Cafe → Leisure' }, 'Cafe', 'Food & Dining')).toBe('Cafe → Food & Dining')
    expect(renamedVendorRule({ name: 'Cafe → Leisure (2)' }, 'Cafe', 'Food & Dining')).toBe('Cafe → Food & Dining')
  })

  it('keeps a name the user chose, or one that already fits', () => {
    expect(renamedVendorRule({ name: 'Coffee shops' }, 'Cafe', 'Food & Dining')).toBeUndefined()
    expect(renamedVendorRule({ name: 'Cafe → Leisure' }, 'Cafe', 'Leisure')).toBeUndefined()
  })
})
