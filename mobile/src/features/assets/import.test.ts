import { stackSeries } from '@/components/charts/MultiSeriesChart'
import { assetPreviewForm } from './import'
import { portfolioSeries, sampleIndices } from './model'

describe('asset import', () => {
  it('sends only the mapped columns and the wallet', () => {
    const file = new Blob(['ticker,date\n'])
    const form = assetPreviewForm(file, { columnMapping: { ticker: 'Symbol', fee: undefined, date: '' }, groupId: 'g1' })
    expect(form.get('column_mapping')).toBe(JSON.stringify({ ticker: 'Symbol' }))
    expect(form.get('group_id')).toBe('g1')
    expect(form.get('file')).toBeTruthy()

    const bare = assetPreviewForm(file, { columnMapping: {}, groupId: null })
    expect(bare.get('column_mapping')).toBeNull()
    expect(bare.get('group_id')).toBeNull()
  })
})

describe('portfolio chart series', () => {
  const data = {
    assets: [
      { id: 'a', name: 'AAPL', group_id: 'w1' },
      { id: 'b', name: 'MSFT', group_id: 'w1' },
      { id: 'c', name: 'House', group_id: null },
      { id: 'd', name: 'BTC', group_id: 'gone' },
    ],
    trend: [
      { date: '2026-09-01', a: 10, b: 5, c: 100, d: 1, _total: 116 },
      { date: '2026-10-01', a: 20, b: 5, c: 100, d: 2, _total: 127 },
    ],
  }
  const wallets = [{ id: 'w1', name: 'Stocks', color: '#0EA5E9' }]

  it("rolls each wallet's holdings into one series and keeps ungrouped ones apart", () => {
    const { dates, series } = portfolioSeries(data, wallets, 'wallet', 'Ungrouped')
    expect(dates).toEqual(['2026-09-01', '2026-10-01'])
    // Largest final value first.
    expect(series.map((s) => [s.key, s.name, s.values])).toEqual([
      ['c', 'House', [100, 100]],
      ['w_w1', 'Stocks', [15, 25]],
      ['w_gone', 'Ungrouped', [1, 2]],
    ])
    expect(series.find((s) => s.key === 'w_w1')!.color).toBe('#0EA5E9')
  })

  it('draws one series per holding by asset', () => {
    const { series } = portfolioSeries(data, wallets, 'asset', 'Ungrouped')
    expect(series.map((s) => s.key)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('stacks series into running totals', () => {
    expect(
      stackSeries([
        { key: 'x', name: 'x', color: '', values: [1, 2] },
        { key: 'y', name: 'y', color: '', values: [3, 4] },
      ]),
    ).toEqual([
      [1, 2],
      [4, 6],
    ])
    expect(sampleIndices(30, 12)).toHaveLength(12)
    expect(sampleIndices(3, 12)).toEqual([0, 1, 2])
  })
})
