import { accountState, groupByInstitution, initiallyIncluded, selectionChange, type ConnectionAccount } from './selection'

const account = (overrides: Partial<ConnectionAccount>): ConnectionAccount => ({
  external_id: 'a',
  name: 'Checking',
  type: 'checking',
  currency: 'USD',
  included: true,
  account_id: null,
  transaction_count: 0,
  is_closed: false,
  institution_name: 'First Bank',
  ...overrides,
})

const mine = account({ external_id: 'mine', account_id: 'm1', transaction_count: 40 })
const hers = account({ external_id: 'hers', account_id: 'h1', transaction_count: 12 })
const kept = account({ external_id: 'kept', account_id: 'k1', included: false })
const offered = account({ external_id: 'offered', included: false, institution_name: 'Credit Union' })

describe('groupByInstitution', () => {
  it('keeps the provider order inside each bank', () => {
    expect(groupByInstitution([mine, offered, hers]).map((g) => [g.institution, g.accounts.map((a) => a.external_id)])).toEqual([
      ['First Bank', ['mine', 'hers']],
      ['Credit Union', ['offered']],
    ])
  })
})

describe('selectionChange', () => {
  const all = [mine, hers, kept, offered]

  it('reports nothing when the choice is unchanged', () => {
    const change = selectionChange(all, initiallyIncluded(all))
    expect(change).toEqual({ excluded: ['kept', 'offered'], losingHistory: [], importing: [], changed: false })
  })

  it('asks about history only for imported accounts being left out now', () => {
    const change = selectionChange(all, new Set(['mine']))
    expect(change.excluded).toEqual(['hers', 'kept', 'offered'])
    expect(change.losingHistory.map((a) => a.external_id)).toEqual(['hers'])
    expect(change.changed).toBe(true)
  })

  it('lists accounts that will be imported', () => {
    const change = selectionChange(all, new Set(['mine', 'hers', 'offered']))
    expect(change.importing.map((a) => a.external_id)).toEqual(['offered'])
  })
})

describe('accountState', () => {
  it('describes each case', () => {
    expect(accountState(mine, true)).toBe('imported')
    expect(accountState(offered, true)).toBe('willImport')
    expect(accountState(offered, false)).toBe('notImported')
    expect(accountState(hers, false)).toBe('willStop')
    expect(accountState(kept, false)).toBe('historyKept')
  })
})
