import type { Transaction } from '@/api/types'
import { NO_SPLIT, splitError, splitFromTransaction, toSplitsInput, type SplitState } from './splits'

const split = (shareType: SplitState['shareType'], values: Record<string, string>): SplitState => ({
  groupId: 'g',
  shareType,
  shares: Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { included: true, value }])),
})

describe('splitError', () => {
  it('accepts an equal split among members', () => {
    expect(splitError(split('equal', { a: '', b: '' }), 30, 'en-US')).toBeNull()
  })

  it('needs exact shares to add up to the amount', () => {
    expect(splitError(split('exact', { a: '10', b: '20' }), 30, 'en-US')).toBeNull()
    expect(splitError(split('exact', { a: '10', b: '15' }), 30, 'en-US')).toBe('groups.split.exactTotal')
  })

  it('needs percentages to add up to 100', () => {
    expect(splitError(split('percent', { a: '33,34', b: '66,66' }), 30, 'pt-BR')).toBeNull()
    expect(splitError(split('percent', { a: '50', b: '40' }), 30, 'en-US')).toBe('groups.split.percentTotal')
  })

  it('needs at least one member', () => {
    expect(splitError({ groupId: 'g', shareType: 'equal', shares: { a: { included: false, value: '' } } }, 10, 'en-US')).toBe(
      'groups.split.chooseMembers',
    )
  })

  it('has nothing to check without a group', () => {
    expect(splitError(NO_SPLIT, 10, 'en-US')).toBeNull()
  })
})

describe('toSplitsInput', () => {
  it('sends included members with their shares', () => {
    const state = split('exact', { a: '1.234,50', b: '0' })
    state.shares.c = { included: false, value: '9' }
    expect(toSplitsInput(state, 'pt-BR')).toEqual({
      share_type: 'exact',
      splits: [
        { group_member_id: 'a', share_amount: '1234.5' },
        { group_member_id: 'b', share_amount: '0' },
      ],
    })
  })

  it('reads back a saved split for editing', () => {
    const tx = {
      group_id: 'g',
      splits: [
        { group_member_id: 'a', share_type: 'percent', share_pct: 60, share_amount: '18' },
        { group_member_id: 'b', share_type: 'percent', share_pct: 40, share_amount: '12' },
      ],
    } as unknown as Transaction
    expect(splitFromTransaction(tx, 'en-US')).toEqual({
      groupId: 'g',
      shareType: 'percent',
      shares: { a: { included: true, value: '60' }, b: { included: true, value: '40' } },
    })
  })
})
