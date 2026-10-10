import { defaultTrendKeys, toggleTrendKey } from './CategoryTrends'
import { categoryShares, donutSlices } from './SpendingByCategory'

describe('category shares', () => {
  it('sorts largest first with each share of the total', () => {
    const shares = categoryShares([
      { key: 'a', label: 'A', color: '#1', value: 25 },
      { key: 'b', label: 'B', color: '#2', value: 75 },
    ])
    expect(shares.map((s) => [s.key, s.share])).toEqual([
      ['b', 0.75],
      ['a', 0.25],
    ])
  })

  it('folds categories past the seventh into one slice', () => {
    const shares = categoryShares(Array.from({ length: 9 }, (_, i) => ({ key: `c${i}`, label: `C${i}`, color: '#0', value: 10 - i })))
    const slices = donutSlices(shares, 'Other', '#999')
    expect(slices).toHaveLength(8)
    expect(slices.at(-1)).toEqual({ key: '__rest', label: 'Other', color: '#999', value: 3 + 2 })
  })
})

describe('category trend picks', () => {
  const item = (key: string, total: number) => ({ key, total, label: key, color: '#0', group: 'expenses', series: [] })

  it('defaults to the three biggest real categories', () => {
    expect(defaultTrendKeys([item('other', 999), item('a', 1), item('b', 5), item('c', 3), item('d', 4)])).toEqual(['b', 'd', 'c'])
  })

  it('keeps between one and five categories', () => {
    expect(toggleTrendKey(['a'], 'a')).toEqual(['a'])
    expect(toggleTrendKey(['a', 'b'], 'a')).toEqual(['b'])
    expect(toggleTrendKey(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(toggleTrendKey(['a'], 'b')).toEqual(['a', 'b'])
  })
})
