import {
  assetProfit,
  assetTypeFromQuoteType,
  assetValuesFrom,
  axisUnit,
  displaySymbol,
  emptyAssetValues,
  growthParamsChanged,
  isLedgerBacked,
  isProviderOwned,
  portfolioShare,
  portfolioTotal,
  projectGrowth,
  sampleSeries,
  sectionAssets,
  toAssetPayload,
  toTxRequest,
  toValuePayload,
  trendWithPurchase,
  valueHistory,
  type Asset,
  type AssetGroup,
  type TxFormValues,
} from './model'

const asset = (overrides: Partial<Asset> = {}): Asset =>
  ({
    id: 'a1',
    user_id: 'u',
    name: 'House',
    type: 'real_estate',
    currency: 'USD',
    valuation_method: 'manual',
    is_archived: false,
    position: 0,
    source: 'manual',
    value_count: 0,
    transaction_count: 0,
    ...overrides,
  }) as Asset

const group = (id: string, name: string, position = 0) => ({ id, name, position, user_id: 'u' }) as AssetGroup

describe('asset helpers', () => {
  it('classifies market quotes and labels Tesouro bonds by name', () => {
    expect(assetTypeFromQuoteType('EQUITY')).toBe('stock')
    expect(assetTypeFromQuoteType('cryptocurrency')).toBe('crypto')
    expect(assetTypeFromQuoteType('MUTUALFUND')).toBe('fund')
    expect(assetTypeFromQuoteType(null)).toBe('investment')
    expect(displaySymbol({ ticker: 'AAPL', name: 'Apple' })).toBe('AAPL')
    expect(displaySymbol({ ticker: 'TD:abc', name: 'Tesouro Selic 2029' })).toBe('Tesouro Selic 2029')
    expect(displaySymbol({ symbol: 'BTC-USD' })).toBe('BTC-USD')
  })

  it('tells provider-owned and ledger-backed holdings apart', () => {
    expect(isProviderOwned(asset({ source: 'pluggy' }))).toBe(true)
    expect(isProviderOwned(asset({ source: 'pluggy', valuation_method: 'market_price' }))).toBe(false)
    expect(isLedgerBacked(asset({ valuation_method: 'market_price', transaction_count: 2 }))).toBe(true)
    expect(isLedgerBacked(asset({ valuation_method: 'market_price' }))).toBe(false)
  })

  it('computes return on cost, realized once sold', () => {
    expect(assetProfit(asset({ value_count: 2, gain_loss: 50, total_invested: 200 }))).toEqual({ amount: 50, percentage: 25 })
    // No valuations yet: nothing to compare against.
    expect(assetProfit(asset({ gain_loss: 50 }))).toBeNull()
    expect(assetProfit(asset({ sell_date: '2026-01-01', sell_price: 900, purchase_price: 1000 }))).toEqual({ amount: -100, percentage: -10 })
  })

  it('shares the portfolio in the primary currency', () => {
    const usd = asset({ current_value: 100 })
    const brl = asset({ current_value: 1000, current_value_primary: 300 })
    expect(portfolioTotal([usd, brl])).toBe(400)
    expect(portfolioShare(brl, 400)).toBe(75)
    expect(portfolioShare(usd, 0)).toBeNull()
  })

  it('sections holdings by wallet, ungrouped last, with sold and archived apart', () => {
    const groups = [group('g2', 'Stocks', 2), group('g1', 'Crypto', 1), group('g3', 'Empty', 3)]
    const assets = [
      asset({ id: 'a', group_id: 'g2' }),
      asset({ id: 'b', group_id: null }),
      asset({ id: 'c', group_id: 'g1' }),
      asset({ id: 'd', group_id: 'gone' }),
      asset({ id: 'e', sell_date: '2026-01-01' }),
      asset({ id: 'f', is_archived: true }),
    ]
    const { sections, sold, archived } = sectionAssets(assets, groups)
    expect(sections.map((s) => [s.groupId, s.assets.map((a) => a.id)])).toEqual([
      ['g1', ['c']],
      ['g2', ['a']],
      ['g3', []],
      [null, ['b', 'd']],
    ])
    expect(sold.map((a) => a.id)).toEqual(['e'])
    expect(archived.map((a) => a.id)).toEqual(['f'])
  })

  it('projects a growth rule to today', () => {
    const today = new Date(2026, 9, 9)
    expect(projectGrowth({ base: 1000, rate: 1, type: 'percentage', frequency: 'monthly', start: '2026-07-09', today })).toBe(1030.3)
    expect(projectGrowth({ base: 1000, rate: 50, type: 'absolute', frequency: 'yearly', start: '2024-10-10', today })).toBe(1050)
    expect(projectGrowth({ base: 1000, rate: null, type: 'percentage', frequency: 'monthly', start: '2026-01-01', today })).toBeNull()
  })

  it('samples long series and picks an axis unit', () => {
    const series = Array.from({ length: 100 }, (_, i) => i)
    const sampled = sampleSeries(series, 12)
    expect(sampled).toHaveLength(12)
    expect(sampled[0]).toBe(0)
    expect(sampled.at(-1)).toBe(99)
    expect(sampleSeries([1, 2], 12)).toEqual([1, 2])
    expect(axisUnit('2026-09-01', '2026-10-09')).toBe('day')
    expect(axisUnit('2025-10-01', '2026-10-09')).toBe('month')
  })

  it('lists the purchase as the opening value unless one already stands for it', () => {
    const values = [
      { id: 'v1', asset_id: 'a1', amount: 1100, date: '2026-02-01', source: 'manual' },
      { id: 'v2', asset_id: 'a1', amount: 1200, date: '2026-03-01', source: 'manual' },
    ]
    const bought = asset({ purchase_price: 1000, purchase_date: '2026-01-01' })
    expect(valueHistory(values, bought).map((v) => v.id)).toEqual(['v2', 'v1', 'purchase'])
    expect(valueHistory([...values, { id: 'v0', asset_id: 'a1', amount: 1000, date: '2026-01-01', source: 'manual' }], bought)).toHaveLength(3)
    expect(trendWithPurchase([{ date: '2026-02-01', amount: 1100 }], bought)[0]).toEqual({ date: '2026-01-01', amount: 1000 })
    expect(trendWithPurchase([], asset())).toEqual([])
  })
})

describe('asset form', () => {
  it('creates a manual asset with an opening value, read in the display locale', () => {
    const values = { ...emptyAssetValues('BRL'), name: ' Apartamento ', type: 'real_estate', purchasePrice: '350.000,50', currentValue: '400.000' }
    const result = toAssetPayload(values, 'pt-BR')
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Apartamento',
        type: 'real_estate',
        currency: 'BRL',
        group_id: null,
        valuation_method: 'manual',
        purchase_date: null,
        purchase_price: '350000.5',
        sell_date: null,
        sell_price: null,
        current_value: '400000',
      },
    })
  })

  it('requires a picked ticker and a quantity for a new market holding', () => {
    const base = { ...emptyAssetValues('USD'), name: 'Apple', method: 'market_price' as const }
    expect(toAssetPayload(base, 'en-US')).toEqual({ ok: false, error: { key: 'assets.errors.pickTicker' } })
    expect(toAssetPayload({ ...base, ticker: 'AAPL', units: '0' }, 'en-US')).toEqual({ ok: false, error: { key: 'assets.errors.quantityInvalid' } })
    const ok = toAssetPayload({ ...base, ticker: 'aapl', tickerExchange: 'NMS', units: '10', unitPrice: '' }, 'en-US')
    expect(ok.ok && ok.value).toMatchObject({
      ticker: 'AAPL',
      ticker_exchange: 'NMS',
      units: '10',
      // Empty → the server prices the opening buy at the live quote.
      unit_price: null,
      purchase_price: null,
    })
  })

  it("never overwrites a ledger-backed holding's quantity, date or cost", () => {
    const holding = asset({
      name: 'Apple',
      valuation_method: 'market_price',
      ticker: 'AAPL',
      units: 10,
      average_price: 150,
      transaction_count: 1,
      purchase_date: '2026-01-02',
    })
    const result = toAssetPayload({ ...assetValuesFrom(holding, 'en-US'), name: 'Apple Inc.' }, 'en-US', holding)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.name).toBe('Apple Inc.')
    expect(result.value).not.toHaveProperty('units')
    expect(result.value).not.toHaveProperty('purchase_date')
    expect(result.value).not.toHaveProperty('purchase_price')
    expect(result.value).not.toHaveProperty('unit_price')
  })

  it('sends the growth schedule and notices when it changes', () => {
    const rule = asset({
      valuation_method: 'growth_rule',
      growth_type: 'percentage',
      growth_rate: 0.5,
      growth_frequency: 'monthly',
      purchase_price: 1000,
      purchase_date: '2026-01-01',
      value_count: 3,
    })
    const values = assetValuesFrom(rule, 'en-US')
    expect(growthParamsChanged(values, rule, 'en-US')).toBe(false)
    expect(growthParamsChanged({ ...values, growthRate: '0.75' }, rule, 'en-US')).toBe(true)
    expect(growthParamsChanged({ ...values, name: 'Renamed' }, rule, 'en-US')).toBe(false)
    const result = toAssetPayload({ ...values, growthRate: '0.75' }, 'en-US', rule)
    expect(result.ok && result.value).toMatchObject({ growth_type: 'percentage', growth_rate: '0.75', growth_frequency: 'monthly' })
  })

  it('rejects names left blank and unreadable amounts', () => {
    expect(toAssetPayload(emptyAssetValues('USD'), 'en-US')).toEqual({ ok: false, error: { key: 'assets.errors.nameRequired' } })
    expect(toAssetPayload({ ...emptyAssetValues('USD'), name: 'Car', purchasePrice: '12a' }, 'en-US')).toEqual({
      ok: false,
      error: { key: 'assets.errors.amountInvalid' },
    })
  })
})

describe('trade form', () => {
  const values: TxFormValues = { holdingId: 'h1', ticker: '', groupId: null, kind: 'buy', quantity: '2', price: '10,5', fee: '1', date: '2026-10-09' }

  it('adds to a holding, buys a new ticker, or edits an entry', () => {
    expect(toTxRequest(values, 'pt-BR', { heldUnits: 0 })).toEqual({
      ok: true,
      value: { type: 'add', assetId: 'h1', body: { kind: 'buy', quantity: '2', price: '10.5', fee: '1', date: '2026-10-09' } },
    })
    expect(toTxRequest({ ...values, holdingId: null, ticker: ' petr4.sa ', groupId: 'g' }, 'pt-BR', {})).toEqual({
      ok: true,
      value: { type: 'buy', body: { ticker: 'PETR4.SA', group_id: 'g', quantity: '2', price: '10.5', fee: '1', date: '2026-10-09' } },
    })
    const edit = toTxRequest({ ...values, kind: 'sell', quantity: '99' }, 'pt-BR', { editingId: 't1', heldUnits: 1 })
    expect(edit.ok && edit.value).toMatchObject({ type: 'update', id: 't1', body: { kind: 'sell', quantity: '99' } })
  })

  it('blocks selling more than is held and invalid numbers', () => {
    expect(toTxRequest({ ...values, kind: 'sell', quantity: '3' }, 'pt-BR', { heldUnits: 2 })).toEqual({
      ok: false,
      error: { key: 'assets.errors.oversell', params: { available: 2 } },
    })
    expect(toTxRequest({ ...values, quantity: '' }, 'en-US', {})).toEqual({ ok: false, error: { key: 'assets.errors.quantityInvalid' } })
    expect(toTxRequest({ ...values, holdingId: null }, 'en-US', {})).toEqual({ ok: false, error: { key: 'assets.errors.tickerRequired' } })
  })

  it('validates a recorded value', () => {
    expect(toValuePayload('1.234,5', '2026-10-09', 'pt-BR')).toEqual({ ok: true, value: { amount: '1234.5', date: '2026-10-09' } })
    expect(toValuePayload('', '2026-10-09', 'en-US').ok).toBe(false)
  })
})
