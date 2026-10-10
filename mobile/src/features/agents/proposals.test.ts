import { apiFetch } from '@/api/client'
import { applyProposal, isProposalData, proposalFromResult, proposalRequest } from './proposals'

jest.mock('@/api/client', () => ({ apiFetch: jest.fn(async () => new Response(null, { status: 204 })) }))

describe('isProposalData / proposalFromResult', () => {
  it('recognises known kinds only', () => {
    expect(isProposalData({ kind: 'create_goal' })).toBe(true)
    expect(isProposalData({ kind: 'drop_database' })).toBe(false)
    expect(isProposalData(null)).toBe(false)
  })

  it('keeps a failed proposal as an error card, ignores other tools', () => {
    expect(proposalFromResult('securo__propose_create_goal', { error: 'target must be positive' })).toEqual({
      error: 'target must be positive',
    })
    expect(proposalFromResult('list_accounts', { kind: 'create_goal' })).toBeNull()
    expect(proposalFromResult('propose_categorize', { rows: [] })).toBeNull()
  })
})

describe('proposalRequest', () => {
  it('re-categorizes the affected transactions in bulk', () => {
    expect(
      proposalRequest({ kind: 'categorize', affected: [{ id: 't1' }, { id: 't2' }], target_category: { id: 'c1', name: 'Food' } }),
    ).toEqual({ method: 'PATCH', path: '/api/transactions/bulk-categorize', body: { transaction_ids: ['t1', 't2'], category_id: 'c1' } })
  })

  it('turns a payee rule into a description-contains rule', () => {
    const request = proposalRequest({ kind: 'create_payee_rule', proposed: { match_pattern: 'UBER', category_id: 'cat-9' } })
    expect(request).toMatchObject({
      method: 'POST',
      path: '/api/rules',
      body: {
        name: 'Rule: UBER',
        conditions_op: 'and',
        conditions: [{ field: 'description', op: 'contains', value: 'UBER' }],
        actions: [{ op: 'set_category', value: 'cat-9' }],
        is_active: true,
      },
    })
  })

  it('maps group splits to the API member field', () => {
    const request = proposalRequest({
      kind: 'create_transaction',
      proposed: {
        description: 'Dinner',
        amount: '90',
        type: 'debit',
        account_id: 'acc',
        splits: { share_type: 'exact', items: [{ member_id: 'm1', share_amount: 30 }, { member_id: 'm2', share_pct: 50 }] },
      },
    })
    expect(request.body).toEqual({
      description: 'Dinner',
      amount: 90,
      type: 'debit',
      account_id: 'acc',
      splits: {
        share_type: 'exact',
        splits: [
          { group_member_id: 'm1', share_amount: 30 },
          { group_member_id: 'm2', share_pct: 50 },
        ],
      },
    })
  })

  it('cancels a recurring item by deactivating or deleting it', () => {
    expect(proposalRequest({ kind: 'cancel_recurring_transaction', target: { id: 'r1' } })).toEqual({
      method: 'PATCH',
      path: '/api/recurring-transactions/r1',
      body: { is_active: false },
    })
    expect(proposalRequest({ kind: 'cancel_recurring_transaction', mode: 'delete', target: { id: 'r1' } })).toEqual({
      method: 'DELETE',
      path: '/api/recurring-transactions/r1',
    })
  })

  it("names a goal's deadline and starting amount the way the API does", () => {
    expect(
      proposalRequest({
        kind: 'create_goal',
        proposed: { name: 'Trip', target_amount: 5000, currency: 'USD', deadline: '2027-06-01', initial_amount: 250 },
      }).body,
    ).toEqual({ name: 'Trip', target_amount: 5000, currency: 'USD', target_date: '2027-06-01', current_amount: 250 })
  })

  it('escapes target ids in the path', () => {
    expect(proposalRequest({ kind: 'delete_rule', target: { id: '../admin' } }).path).toBe('/api/rules/..%2Fadmin')
  })
})

describe('applyProposal', () => {
  it('sends JSON, dropping unset optional fields', async () => {
    await applyProposal({ kind: 'create_category', proposed: { name: 'Pets' } })
    const [path, init] = (apiFetch as jest.Mock).mock.calls[0]!
    expect(path).toBe('/api/categories')
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } })
    expect(JSON.parse(init.body)).toEqual({ name: 'Pets' })
  })
})
