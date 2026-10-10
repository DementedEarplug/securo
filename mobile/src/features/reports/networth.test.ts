import type { Report } from '@/api/types'
import {
  baselineValue,
  breakdownGroups,
  compositionRows,
  groupTotals,
  itemColors,
  itemSeries,
  ITEM_PALETTE,
  OTHER_COLOR,
  selectedSnapshot,
  type CompositionItem,
  type NetWorthPoint,
} from './networth'

const item = (key: string, value: number, group: string, label = key): CompositionItem =>
  ({ key, label, value, group, color: '#000' }) as CompositionItem

const point = (date: string, composition: CompositionItem[]): NetWorthPoint => {
  const sum = (g: string) => composition.filter((c) => c.group === g).reduce((s, c) => s + c.value, 0)
  const breakdowns = { accounts: sum('accounts'), assets: sum('assets'), liabilities: sum('liabilities') }
  return { date, value: breakdowns.accounts + breakdowns.assets - breakdowns.liabilities, breakdowns, composition } as NetWorthPoint
}

const trend = [
  point('2026-08', [item('chk', 1000, 'accounts'), item('card', 300, 'liabilities'), item('car', 9000, 'assets')]),
  point('2026-09', [item('chk', 1500, 'accounts'), item('card', 200, 'liabilities'), item('car', 8800, 'assets')]),
  point('2026-10', [item('chk', 2000, 'accounts'), item('card', 500, 'liabilities'), item('car', 8600, 'assets'), item('sav', 50, 'accounts')]),
]

describe('net worth breakdown', () => {
  it('stacks accounts and assets above zero and debts below', () => {
    expect(breakdownGroups(trend, (d) => d)[0]).toEqual({ label: '2026-08', values: [1000, 9000, -300] })
    expect(groupTotals(trend[2]!)).toEqual({ accounts: 2050, assets: 8600, liabilities: 500, net: 10150 })
  })

  it('keeps each holding on one colour, largest first, the long tail grey', () => {
    const many = Array.from({ length: ITEM_PALETTE.length + 1 }, (_, i) => item(`a${i}`, 100 - i, 'accounts'))
    const colors = itemColors(many)
    expect(colors.get('a0')).toBe(ITEM_PALETTE[0])
    expect(colors.get(`a${ITEM_PALETTE.length}`)).toBe(OTHER_COLOR)
  })

  it('filters composition rows by view and shares them within the view', () => {
    const items = trend[2]!.composition!
    const colors = itemColors(items)
    const owned = compositionRows(items, 'assetsAndAccounts', colors)
    expect(owned.map((r) => r.key)).toEqual(['chk', 'sav', 'car'])
    expect(owned.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1)
    expect(compositionRows(items, 'liabilities', colors).map((r) => r.key)).toEqual(['card'])
    expect(compositionRows(items, 'netWorth', colors)).toHaveLength(4)
  })

  it('draws the biggest holdings as lines (debts negative) and folds the rest into Other', () => {
    const series = itemSeries(trend, itemColors(trend[2]!.composition!), { max: 2, otherLabel: 'Other' })
    expect(series.map((s) => s.key)).toEqual(['car', 'chk', '__other'])
    expect(series[0]!.values).toEqual([9000, 8800, 8600])
    // card (-300, -200, -500) + savings (0, 0, 50)
    expect(series[2]!.values).toEqual([-300, -200, -450])
  })

  it('selects the tapped snapshot, falling back to the latest', () => {
    expect(selectedSnapshot(trend, '2026-09')).toMatchObject({ index: 1, isLatest: false })
    expect(selectedSnapshot(trend, 'gone')).toMatchObject({ index: 2, isLatest: true })
    expect(selectedSnapshot([], null)).toEqual({ point: null, index: -1, isLatest: true })
  })

  it('derives the start-of-range value from the summary', () => {
    expect(baselineValue({ summary: { primary_value: 10150, change_amount: 450 } } as Report)).toBe(9700)
  })
})
