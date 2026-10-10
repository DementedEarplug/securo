import { drillDownRouteParams, parseDrillDownParams } from './drilldown'

describe('drill-down params', () => {
  it('round-trips through string route params', () => {
    const params = {
      title: 'Groceries',
      from: '2026-10-01',
      to: '2026-10-09',
      accountIds: ['a1', 'a2'],
      categoryIds: ['c1'],
      type: 'debit' as const,
    }
    const route = drillDownRouteParams(params)
    expect(route).toEqual({ title: 'Groceries', from: '2026-10-01', to: '2026-10-09', accountIds: 'a1,a2', categoryIds: 'c1', type: 'debit' })
    expect(parseDrillDownParams(route)).toEqual({ ...params, payeeId: undefined, q: undefined })
  })

  it('ignores an unknown type', () => {
    expect(parseDrillDownParams({ title: 'x', type: 'transfer' }).type).toBeUndefined()
  })
})
