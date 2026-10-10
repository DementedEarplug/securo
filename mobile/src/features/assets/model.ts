import type { components } from '@/api/schema'
import { formatAmountInput, parseAmountInput } from '@/lib/format'

type Schemas = components['schemas']
export type Asset = Schemas['AssetRead']
export type AssetGroup = Schemas['AssetGroupRead']
export type AssetTransaction = Schemas['AssetTransactionRead']
export type AssetValue = Schemas['AssetValueRead']
export type MarketMatch = Schemas['MarketSymbolMatch']
export type MarketQuote = Schemas['MarketSymbolQuote']

export const ASSET_TYPES = ['stock', 'etf', 'crypto', 'fund', 'real_estate', 'vehicle', 'valuable', 'investment', 'other'] as const
export const VALUATION_METHODS = ['manual', 'growth_rule', 'market_price'] as const
export const GROWTH_TYPES = ['percentage', 'absolute'] as const
export const GROWTH_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const

export type ValuationMethod = (typeof VALUATION_METHODS)[number]
export type GrowthType = (typeof GROWTH_TYPES)[number]
export type GrowthFrequency = (typeof GROWTH_FREQUENCIES)[number]
export type TxKind = 'buy' | 'sell'

/** An i18n key (in the `assets` namespace or shared) plus its interpolation values. */
export interface FormError {
  key: string
  params?: Record<string, string | number>
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: FormError }

const fail = (key: string, params?: FormError['params']): { ok: false; error: FormError } => ({ ok: false, error: { key, params } })

/** Map a market-data `quoteType` to Securo's asset type, as the web form does. */
export function assetTypeFromQuoteType(quoteType: string | null | undefined): string {
  switch ((quoteType || '').toUpperCase()) {
    case 'EQUITY':
      return 'stock'
    case 'ETF':
      return 'etf'
    case 'CRYPTOCURRENCY':
      return 'crypto'
    case 'MUTUALFUND':
    case 'INDEX':
      return 'fund'
    default:
      return 'investment'
  }
}

/**
 * The label a holding goes by: its ticker, except Brazilian Tesouro bonds
 * whose internal `TD:*` symbol means nothing to a person.
 */
export function displaySymbol(item: { ticker?: string | null; name?: string | null; symbol?: string | null }): string {
  const symbol = item.ticker ?? item.symbol ?? null
  if (symbol && !symbol.startsWith('TD:')) return symbol
  return item.name || symbol || ''
}

/** Assets a bank connection syncs (not market-priced) are managed by that connection. */
export function isProviderOwned(asset: Pick<Asset, 'source' | 'valuation_method'>): boolean {
  return (asset.source ?? 'manual') !== 'manual' && asset.valuation_method !== 'market_price'
}

/** Market holdings whose quantity, buy date and cost come from their buy/sell ledger. */
export function isLedgerBacked(asset: Pick<Asset, 'valuation_method' | 'average_price' | 'transaction_count'>): boolean {
  return asset.valuation_method === 'market_price' && (asset.average_price != null || (asset.transaction_count ?? 0) > 0)
}

export function isSold(asset: Pick<Asset, 'sell_date'>): boolean {
  return Boolean(asset.sell_date)
}

/** Gain (realized once sold) and its return on cost, mirroring the web holdings table. */
export function assetProfit(
  asset: Pick<Asset, 'gain_loss' | 'purchase_price' | 'realized_gain' | 'sell_date' | 'sell_price' | 'total_invested' | 'value_count'>,
): { amount: number; percentage: number | null } | null {
  const amount = asset.sell_date
    ? (asset.realized_gain ??
      (asset.sell_price != null && asset.purchase_price != null ? asset.sell_price - asset.purchase_price : null))
    : (asset.value_count ?? 0) > 0
      ? (asset.gain_loss ?? null)
      : null
  if (amount == null) return null
  const cost = asset.total_invested ?? asset.purchase_price
  return { amount, percentage: cost ? (amount / cost) * 100 : null }
}

/**
 * Value in the user's primary currency. The API only fills
 * `current_value_primary` for assets held in another currency.
 */
export function valuePrimary(asset: Pick<Asset, 'current_value' | 'current_value_primary'>): number | null {
  const value = asset.current_value_primary ?? asset.current_value
  return value == null ? null : Number(value)
}

export function portfolioTotal(assets: Pick<Asset, 'current_value' | 'current_value_primary'>[]): number {
  return assets.reduce((sum, a) => sum + (valuePrimary(a) ?? 0), 0)
}

export function portfolioShare(asset: Pick<Asset, 'current_value' | 'current_value_primary'>, total: number): number | null {
  const value = valuePrimary(asset)
  return value == null || !(total > 0) ? null : (value / total) * 100
}

export interface AssetSection {
  /** Wallet id; `null` for ungrouped holdings. */
  groupId: string | null
  group: AssetGroup | null
  assets: Asset[]
}

/**
 * Current holdings by wallet (in wallet order, ungrouped last, empty wallets
 * kept so they can be managed), plus sold and archived holdings apart.
 */
export function sectionAssets(
  assets: Asset[],
  groups: AssetGroup[],
): { sections: AssetSection[]; sold: Asset[]; archived: Asset[] } {
  const active = assets.filter((a) => !a.is_archived && !a.sell_date)
  const known = new Set(groups.map((g) => g.id))
  const ordered = [...groups].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name))
  const sections: AssetSection[] = ordered.map((group) => ({
    groupId: group.id,
    group,
    assets: active.filter((a) => a.group_id === group.id),
  }))
  const ungrouped = active.filter((a) => !a.group_id || !known.has(a.group_id))
  if (ungrouped.length) sections.push({ groupId: null, group: null, assets: ungrouped })
  return {
    sections,
    sold: assets.filter((a) => !a.is_archived && a.sell_date),
    archived: assets.filter((a) => a.is_archived),
  }
}

/** Advance a `yyyy-MM-dd` date by one growth period (local calendar). */
function nextPeriod(date: Date, frequency: GrowthFrequency): Date {
  const next = new Date(date)
  if (frequency === 'daily') next.setDate(next.getDate() + 1)
  else if (frequency === 'weekly') next.setDate(next.getDate() + 7)
  else if (frequency === 'monthly') next.setMonth(next.getMonth() + 1)
  else next.setFullYear(next.getFullYear() + 1)
  return next
}

/**
 * Today's value under a growth rule, compounding (percentage) or adding
 * (absolute) once per elapsed period, as the web form previews it.
 */
export function projectGrowth({
  base,
  rate,
  type,
  frequency,
  start,
  today = new Date(),
}: {
  base: number | null
  rate: number | null
  type: GrowthType
  frequency: GrowthFrequency
  start: string | null
  today?: Date
}): number | null {
  if (!base || !rate || !start) return null
  const [y, m, d] = start.split('-').map(Number)
  if (!y || !m || !d) return null
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let current = base
  let date = new Date(y, m - 1, d)
  for (let i = 0; i < 10000; i++) {
    const next = nextPeriod(date, frequency)
    if (next > end) break
    current = type === 'percentage' ? current * (1 + rate / 100) : current + rate
    date = next
  }
  return Math.round(current * 100) / 100
}

// ---------------------------------------------------------------------------
// Asset form
// ---------------------------------------------------------------------------

export interface AssetFormValues {
  name: string
  type: string
  currency: string
  groupId: string | null
  method: ValuationMethod
  purchaseDate: string | null
  purchasePrice: string
  sellDate: string | null
  sellPrice: string
  /** Opening value of a new manual asset. */
  currentValue: string
  growthType: GrowthType
  growthRate: string
  growthFrequency: GrowthFrequency
  growthStartDate: string | null
  /** The market symbol picked from search (or the existing holding's). */
  ticker: string | null
  tickerExchange: string | null
  units: string
  /** Per-unit price of the opening buy of a new market holding. */
  unitPrice: string
}

export function emptyAssetValues(currency: string): AssetFormValues {
  return {
    name: '',
    type: 'other',
    currency,
    groupId: null,
    method: 'manual',
    purchaseDate: null,
    purchasePrice: '',
    sellDate: null,
    sellPrice: '',
    currentValue: '',
    growthType: 'percentage',
    growthRate: '',
    growthFrequency: 'monthly',
    growthStartDate: null,
    ticker: null,
    tickerExchange: null,
    units: '',
    unitPrice: '',
  }
}

const input = (value: number | null | undefined, locale: string, digits = 2) =>
  value == null ? '' : formatAmountInput(value, locale, digits)

function oneOf<T extends string>(list: readonly T[], value: string | null | undefined, fallback: T): T {
  return (list as readonly string[]).includes(value ?? '') ? (value as T) : fallback
}

export function assetValuesFrom(asset: Asset, locale: string): AssetFormValues {
  return {
    name: asset.name,
    type: asset.type,
    currency: asset.currency,
    groupId: asset.group_id ?? null,
    method: oneOf(VALUATION_METHODS, asset.valuation_method, 'manual'),
    purchaseDate: asset.purchase_date ?? null,
    purchasePrice: input(asset.purchase_price, locale),
    sellDate: asset.sell_date ?? null,
    sellPrice: input(asset.sell_price, locale),
    currentValue: '',
    growthType: oneOf(GROWTH_TYPES, asset.growth_type, 'percentage'),
    growthRate: input(asset.growth_rate, locale, 6),
    growthFrequency: oneOf(GROWTH_FREQUENCIES, asset.growth_frequency, 'monthly'),
    growthStartDate: asset.growth_start_date ?? null,
    ticker: asset.ticker ?? null,
    tickerExchange: asset.ticker_exchange ?? null,
    units: input(asset.units, locale, 8),
    unitPrice: '',
  }
}

/** Parse an optional amount field: '' → null, garbage → error. */
function optionalAmount(value: string, locale: string): Result<number | null> {
  if (!value.trim()) return { ok: true, value: null }
  const parsed = parseAmountInput(value, locale)
  return parsed === null ? fail('assets.errors.amountInvalid') : { ok: true, value: parsed }
}

type AssetBody = Schemas['AssetCreate'] & Schemas['AssetUpdate']

/**
 * The create/update body for the asset form, following the web's rules:
 * ledger-backed holdings never overwrite their derived quantity/date/cost,
 * tickers carry no total purchase price or sale, and a new manual asset may
 * seed its first recorded value.
 */
export function toAssetPayload(
  values: AssetFormValues,
  locale: string,
  editing?: Asset,
): Result<Partial<AssetBody>> {
  const name = values.name.trim()
  if (!name) return fail('assets.errors.nameRequired')
  const isMarket = values.method === 'market_price'
  const ledgerBacked = editing ? isLedgerBacked(editing) : false

  const purchasePrice = optionalAmount(values.purchasePrice, locale)
  const sellPrice = optionalAmount(values.sellPrice, locale)
  const currentValue = optionalAmount(values.currentValue, locale)
  const growthRate = optionalAmount(values.growthRate, locale)
  const units = optionalAmount(values.units, locale)
  const unitPrice = optionalAmount(values.unitPrice, locale)
  for (const r of [purchasePrice, sellPrice, currentValue, growthRate, units, unitPrice]) if (!r.ok) return r
  const num = (r: Result<number | null>) => (r.ok && r.value != null ? String(r.value) : null)

  if (isMarket && !editing) {
    if (!values.ticker) return fail('assets.errors.pickTicker')
    if (!units.ok || units.value == null || units.value <= 0) return fail('assets.errors.quantityInvalid')
  }

  const body: Partial<AssetBody> = {
    name,
    type: values.type,
    currency: values.currency,
    group_id: values.groupId,
    valuation_method: values.method,
  }
  if (!ledgerBacked) body.purchase_date = values.purchaseDate
  if (!isMarket) {
    body.purchase_price = num(purchasePrice)
    body.sell_date = values.sellDate
    body.sell_price = num(sellPrice)
  } else if (!editing) {
    body.purchase_price = null
    body.sell_date = null
    body.sell_price = null
  }
  if (values.method === 'growth_rule') {
    body.growth_type = values.growthType
    body.growth_rate = num(growthRate)
    body.growth_frequency = values.growthFrequency
    body.growth_start_date = values.growthStartDate
  }
  if (isMarket) {
    body.ticker = (values.ticker ?? '').toUpperCase()
    body.ticker_exchange = values.tickerExchange
    if (!ledgerBacked) body.units = num(units)
    // Omitted → the server prices the opening buy at the live quote.
    if (!editing) body.unit_price = num(unitPrice)
  }
  if (!editing && values.method === 'manual' && currentValue.ok && currentValue.value != null) {
    body.current_value = String(currentValue.value)
  }
  return { ok: true, value: body }
}

/**
 * Whether saving changes a growth-rule asset's schedule, which makes the
 * server discard and regenerate its rule-generated values.
 */
export function growthParamsChanged(values: AssetFormValues, asset: Asset, locale: string): boolean {
  if (asset.valuation_method !== 'growth_rule' || values.method !== 'growth_rule') return false
  const same = (text: string, value: number | null | undefined) => {
    const parsed = text.trim() ? parseAmountInput(text, locale) : null
    return (parsed ?? null) === (value ?? null)
  }
  return (
    values.growthType !== (asset.growth_type ?? 'percentage') ||
    !same(values.growthRate, asset.growth_rate) ||
    values.growthFrequency !== (asset.growth_frequency ?? 'monthly') ||
    values.growthStartDate !== (asset.growth_start_date ?? null) ||
    !same(values.purchasePrice, asset.purchase_price) ||
    values.purchaseDate !== (asset.purchase_date ?? null)
  )
}

// ---------------------------------------------------------------------------
// Buy / sell ledger
// ---------------------------------------------------------------------------

export interface TxFormValues {
  /** Existing holding, or `null` to buy a new ticker. */
  holdingId: string | null
  ticker: string
  groupId: string | null
  kind: TxKind
  quantity: string
  price: string
  fee: string
  date: string
}

export type TxRequest =
  | { type: 'update'; id: string; body: Schemas['AssetTransactionUpdate'] }
  | { type: 'buy'; body: Schemas['AssetBuyCreate'] }
  | { type: 'add'; assetId: string; body: Schemas['AssetTransactionCreate'] }

export function txValuesFrom(tx: AssetTransaction, locale: string): TxFormValues {
  return {
    holdingId: tx.asset_id,
    ticker: tx.ticker ?? '',
    groupId: null,
    kind: tx.kind === 'sell' ? 'sell' : 'buy',
    quantity: input(tx.quantity, locale, 8),
    price: input(tx.price, locale, 6),
    fee: tx.fee ? input(tx.fee, locale) : '',
    date: tx.date,
  }
}

/** Signed cash total of a trade: what a buy costs, what a sell brings in. */
export function txTotal(quantity: number, price: number, fee: number, kind: TxKind): number {
  return quantity * price + (kind === 'buy' ? fee : -fee)
}

/**
 * Validate the trade form and pick the endpoint: edit an entry, buy a new
 * ticker (creates the holding), or add to an existing holding. A fresh sell
 * can't exceed the units held (no short positions); edits are checked
 * server-side.
 */
export function toTxRequest(
  values: TxFormValues,
  locale: string,
  { editingId, heldUnits }: { editingId?: string | null; heldUnits?: number | null },
): Result<TxRequest> {
  const quantity = parseAmountInput(values.quantity, locale)
  const price = parseAmountInput(values.price, locale)
  const fee = values.fee.trim() ? parseAmountInput(values.fee, locale) : 0
  if (quantity === null || quantity <= 0) return fail('assets.errors.quantityInvalid')
  if (price === null || price < 0) return fail('assets.errors.priceInvalid')
  if (fee === null || fee < 0) return fail('assets.errors.amountInvalid')
  const money = { quantity: String(quantity), price: String(price), fee: String(fee), date: values.date }

  if (editingId) return { ok: true, value: { type: 'update', id: editingId, body: { kind: values.kind, ...money } } }
  if (!values.holdingId) {
    const ticker = values.ticker.trim().toUpperCase()
    if (!ticker) return fail('assets.errors.tickerRequired')
    return { ok: true, value: { type: 'buy', body: { ticker, group_id: values.groupId, ...money } } }
  }
  if (values.kind === 'sell' && quantity > (heldUnits ?? 0)) {
    return fail('assets.errors.oversell', { available: heldUnits ?? 0 })
  }
  return { ok: true, value: { type: 'add', assetId: values.holdingId, body: { kind: values.kind, ...money } } }
}

/** Validate a manually recorded value. */
export function toValuePayload(amount: string, date: string, locale: string): Result<Schemas['AssetValueCreate']> {
  const parsed = parseAmountInput(amount, locale)
  if (parsed === null || parsed < 0) return fail('assets.errors.amountInvalid')
  return { ok: true, value: { amount: String(parsed), date } }
}

/**
 * Value history newest first, with the purchase as the opening entry when no
 * recorded value already stands for it (as the web lists it).
 */
export function valueHistory(
  values: AssetValue[],
  asset: Pick<Asset, 'id' | 'purchase_price' | 'purchase_date'>,
): AssetValue[] {
  const sorted = [...values].sort((a, b) => b.date.localeCompare(a.date))
  const { purchase_price: price, purchase_date: date } = asset
  if (!price || !date) return sorted
  if (sorted.some((v) => v.date === date && Number(v.amount) === Number(price))) return sorted
  return [...sorted, { id: 'purchase', asset_id: asset.id, amount: price, date, source: 'purchase' }]
}

/** Value trend points with the purchase prepended when it predates the series. */
export function trendWithPurchase(
  trend: { date: string; amount: number }[],
  asset: Pick<Asset, 'purchase_price' | 'purchase_date'>,
): { date: string; amount: number }[] {
  const { purchase_price: price, purchase_date: date } = asset
  if (price && date && (trend.length === 0 || date < trend[0]!.date)) return [{ date, amount: price }, ...trend]
  return trend
}

/**
 * At most `max` evenly spaced points (first and last kept), so a daily
 * series fits the compact line chart and its axis labels stay readable.
 */
export function sampleSeries<T>(series: T[], max = 12): T[] {
  if (series.length <= max) return series
  const step = (series.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => series[Math.round(i * step)]!)
}

/** Label axis ticks by day when the series spans about two months or less, else by month. */
export function axisUnit(first: string | undefined, last: string | undefined): 'day' | 'month' {
  if (!first || !last) return 'month'
  const days = (Date.parse(last) - Date.parse(first)) / 86_400_000
  return days <= 62 ? 'day' : 'month'
}

export const PORTFOLIO_COLORS = ['#6366F1', '#F43F5E', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

export interface PortfolioSeries {
  key: string
  name: string
  color: string
  values: number[]
}

/**
 * The portfolio trend split into chart series, as the web chart does it.
 * By wallet: each wallet's holdings roll into one series in the wallet's
 * colour (wallet order), ungrouped holdings keep their own series. By
 * asset: one series per holding. Largest final value first.
 */
export function portfolioSeries(
  data: { assets: { id: string; name: string; group_id: string | null }[]; trend: Record<string, unknown>[] },
  wallets: Pick<AssetGroup, 'id' | 'name' | 'color'>[],
  mode: 'wallet' | 'asset',
  ungroupedLabel: string,
): { dates: string[]; series: PortfolioSeries[] } {
  const dates = data.trend.map((row) => String(row.date))
  const valueOf = (row: Record<string, unknown>, id: string) => Number(row[id]) || 0
  let palette = 0
  const nextColor = () => PORTFOLIO_COLORS[palette++ % PORTFOLIO_COLORS.length]!
  const sources: { key: string; name: string; color: string; ids: string[] }[] = []

  if (mode === 'asset') {
    for (const a of data.assets) sources.push({ key: a.id, name: a.name, color: nextColor(), ids: [a.id] })
  } else {
    const buckets = new Map<string, string[]>()
    for (const a of data.assets) {
      if (a.group_id) buckets.set(a.group_id, [...(buckets.get(a.group_id) ?? []), a.id])
    }
    const known = new Map(wallets.map((w) => [w.id, w]))
    const order = [...wallets.map((w) => w.id).filter((id) => buckets.has(id)), ...[...buckets.keys()].filter((id) => !known.has(id))]
    for (const id of order) {
      const wallet = known.get(id)
      sources.push({ key: `w_${id}`, name: wallet?.name ?? ungroupedLabel, color: wallet?.color ?? nextColor(), ids: buckets.get(id)! })
    }
    for (const a of data.assets.filter((asset) => !asset.group_id)) {
      sources.push({ key: a.id, name: a.name, color: nextColor(), ids: [a.id] })
    }
  }

  const series = sources.map(({ ids, ...s }) => ({
    ...s,
    values: data.trend.map((row) => ids.reduce((sum, id) => sum + valueOf(row, id), 0)),
  }))
  const last = (s: PortfolioSeries) => Math.abs(s.values.at(-1) ?? 0)
  series.sort((a, b) => last(b) - last(a) || a.name.localeCompare(b.name))
  return { dates, series }
}

/** Keep the same evenly spaced points of every series (see `sampleSeries`). */
export function sampleIndices(length: number, max = 12): number[] {
  return sampleSeries(Array.from({ length }, (_, i) => i), max)
}
