import { changeField, draftFrom, opsForField, ruleError, toRuleBody, type RuleDraft } from './model'

const draft = (patch: Partial<RuleDraft> = {}): RuleDraft => ({
  name: 'Uber',
  conditionsOp: 'and',
  conditions: [{ field: 'description', op: 'contains', value: 'UBER' }],
  actions: [{ op: 'set_category', value: 'cat-1' }],
  isActive: true,
  priority: '0',
  overwriteExisting: false,
  ...patch,
})

describe('rule model', () => {
  it('offers operators that fit the field', () => {
    expect(opsForField('amount')).toEqual(['equals', 'gt', 'gte', 'lt', 'lte'])
    expect(opsForField('type')).toEqual(['equals'])
    expect(opsForField('notes')).toContain('regex')
  })

  it('resets op and value when the field changes', () => {
    expect(changeField({ field: 'description', op: 'regex', value: 'x' }, 'status')).toEqual({ field: 'status', op: 'equals', value: 'pending' })
  })

  it('builds the body the server expects, with a nested group', () => {
    const body = toRuleBody(
      draft({
        conditions: [
          { field: 'amount', op: 'gt', value: '10,5' },
          { op: 'or', conditions: [{ field: 'description', op: 'contains', value: ' UBER ' }, { field: 'description', op: 'contains', value: '99POP' }] },
        ],
        actions: [{ op: 'set_category', value: 'cat-1' }, { op: 'ignore', value: 'x' }],
      }),
    )
    expect(body.conditions).toEqual([
      { field: 'amount', op: 'gt', value: 10.5 },
      { op: 'or', conditions: [{ field: 'description', op: 'contains', value: 'UBER' }, { field: 'description', op: 'contains', value: '99POP' }] },
    ])
    expect(body.actions).toEqual([{ op: 'set_category', value: 'cat-1' }, { op: 'ignore', value: '' }])
  })

  it('refuses blank values and empty groups', () => {
    expect(ruleError(draft())).toBeNull()
    expect(ruleError(draft({ conditions: [{ field: 'notes', op: 'contains', value: ' ' }] }))).toBe('rules.errors.blankValue')
    expect(ruleError(draft({ conditions: [{ op: 'or', conditions: [] }] }))).toBe('rules.errors.emptyGroup')
    expect(ruleError(draft({ actions: [] }))).toBe('rules.errors.noActions')
  })

  it('reads a saved rule back for editing', () => {
    const rule = { id: 'r', user_id: 'u', name: 'Big', conditions_op: 'and', is_active: false, priority: 2,
      conditions: [{ field: 'amount', op: 'gte', value: 100 }], actions: [{ op: 'ignore', value: '' }] }
    expect(draftFrom(rule as never)).toMatchObject({ name: 'Big', isActive: false, priority: '2', conditions: [{ field: 'amount', op: 'gte', value: '100' }] })
  })
})
