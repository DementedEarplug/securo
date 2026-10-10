import { formatShare, nextPayeeLimit, payeeQuery, payeeRows, type PayeeReport } from './payees'

const meta = {
  currency: 'USD',
  type: 'debit',
  start_date: '2026-09-01',
  end_date: '2026-09-30',
  previous_start_date: '2026-08-02',
  previous_end_date: '2026-08-31',
}

function report(items: { id: string; total: number; previous: number; count?: number }[], unassigned = 0): PayeeReport {
  return {
    items: items.map((i) => ({ payee_id: i.id, name: i.id.toUpperCase(), total: i.total, previous_total: i.previous, count: i.count ?? 1 })),
    unassigned: { total: unassigned, count: unassigned ? 2 : 0, previous_total: 0 },
    meta,
  }
}

describe('payeeRows', () => {
  it('ranks by total, with bars relative to the biggest payee', () => {
    const rows = payeeRows(report([{ id: 'b', total: 50, previous: 40 }, { id: 'a', total: 200, previous: 100 }]), 1000)
    expect(rows.map((r) => [r.id, r.bar])).toEqual([
      ['a', 1],
      ['b', 0.25],
    ])
  })

  it('takes shares from the whole period total, so payees past the limit still count', () => {
    const rows = payeeRows(report([{ id: 'a', total: 200, previous: 0 }]), 1000)
    expect(rows[0]!.share).toBe(0.2)
  })

  it('falls back to what the response covers, including rows without a payee', () => {
    const rows = payeeRows(report([{ id: 'a', total: 300, previous: 0 }], 100), null)
    expect(rows[0]!.share).toBe(0.75)
  })

  it('compares with the previous period and flags payees new to this one', () => {
    const [up, fresh] = payeeRows(report([{ id: 'up', total: 150, previous: 100 }, { id: 'new', total: 80, previous: 0 }]), null)
    expect(up!.change).toMatchObject({ change: 50, percent: 50 })
    expect(up!.isNew).toBe(false)
    expect(fresh!.isNew).toBe(true)
    expect(fresh!.change.percent).toBeNull()
  })

  it('has nothing to rank in an empty period', () => {
    expect(payeeRows(report([]), 0)).toEqual([])
  })
})

describe('payee query and limits', () => {
  it('sends the range as explicit dates and accounts only when filtered', () => {
    expect(payeeQuery({ from: '2026-09-01', to: '2026-09-30' }, 'debit', 10, [])).toEqual({
      type: 'debit',
      start_date: '2026-09-01',
      end_date: '2026-09-30',
      limit: 10,
    })
    expect(payeeQuery({ from: '2026-09-01', to: '2026-09-30' }, 'credit', 25, ['acc']).account_ids).toEqual(['acc'])
  })

  it('steps "show more" up to the API maximum', () => {
    expect(nextPayeeLimit(10)).toBe(25)
    expect(nextPayeeLimit(25)).toBe(50)
    expect(nextPayeeLimit(50)).toBeNull()
  })

  it('formats shares', () => {
    expect(formatShare(0.1234)).toBe('12.3%')
    expect(formatShare(null)).toBeNull()
  })
})
