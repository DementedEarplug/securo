import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SelectSheet } from '@/components/SelectSheet'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useCurrencies } from '@/features/accounts/hooks'
import { fetchQuote, useAsset, useAssetGroups, useDebounced, useMarketSearch, useRefreshPrice, useSaveAsset } from '@/features/assets/hooks'
import {
  ASSET_TYPES,
  GROWTH_FREQUENCIES,
  GROWTH_TYPES,
  assetTypeFromQuoteType,
  assetValuesFrom,
  displaySymbol,
  emptyAssetValues,
  growthParamsChanged,
  isLedgerBacked,
  projectGrowth,
  toAssetPayload,
  type Asset,
  type AssetFormValues,
  type GrowthFrequency,
  type MarketMatch,
  type MarketQuote,
  type ValuationMethod,
} from '@/features/assets/model'
import { OptionalDateField } from '@/features/assets/OptionalDateField'
import { useDisplayFormat } from '@/features/session/hooks'
import { confirmDestructive } from '@/lib/confirm'
import { formatRelative } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatAmountInput, formatCurrency, parseAmountInput } from '@/lib/format'
import { spacing, useColors } from '@/theme'

/** Add an asset, or edit one (`?id=`). */
export default function AssetFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const asset = useAsset(id)
  if (id && asset.isPending) return <Loading />
  if (id && asset.isError) return <ErrorState error={asset.error} onRetry={() => asset.refetch()} />
  return <AssetForm asset={id ? asset.data : undefined} />
}

/** A quote for the holding being edited, from its cached price (no round-trip to the market). */
function cachedQuote(asset: Asset | undefined): MarketQuote | null {
  if (!asset?.ticker || asset.last_price == null) return null
  return { symbol: asset.ticker, name: asset.name, exchange: asset.ticker_exchange, currency: asset.currency, price: asset.last_price, quote_type: null }
}

function AssetForm({ asset }: { asset?: Asset }) {
  const { t, i18n } = useTranslation()
  const colors = useColors()
  const { locale, currency } = useDisplayFormat()
  const groups = useAssetGroups().data ?? []
  const currencies = useCurrencies().data ?? []
  const save = useSaveAsset()
  const refresh = useRefreshPrice()
  const [v, setV] = useState<AssetFormValues>(() => (asset ? assetValuesFrom(asset, locale) : emptyAssetValues(currency)))
  const set = (patch: Partial<AssetFormValues>) => setV((current) => ({ ...current, ...patch }))
  const [picking, setPicking] = useState<'type' | 'currency' | 'group' | 'frequency' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState(asset?.ticker ?? '')
  const [quote, setQuote] = useState<MarketQuote | null>(() => cachedQuote(asset))
  const [quoting, setQuoting] = useState(false)
  const debounced = useDebounced(query)
  const market = v.method === 'market_price'
  const searching = market && !asset && !(quote && query.trim().toUpperCase() === quote.symbol.toUpperCase())
  const matches = useMarketSearch(searching ? debounced : '')
  const ledgerBacked = asset ? isLedgerBacked(asset) : false

  const pickMatch = async (match: MarketMatch) => {
    setQuery(match.symbol)
    setQuoting(true)
    setError(null)
    try {
      const next = await fetchQuote(match.symbol)
      setQuote(next)
      setV((current) => ({
        ...current,
        ticker: next.symbol,
        tickerExchange: next.exchange ?? null,
        currency: next.currency,
        // Keep a name the user typed; replace one we filled from a previous pick.
        name: !current.name || current.name === (quote?.name ?? quote?.symbol ?? '') ? next.name || next.symbol : current.name,
        type: current.type === 'other' || current.type === 'investment' ? assetTypeFromQuoteType(next.quote_type) : current.type,
        // Buying at market now is the common case; the user overrides with their real cost.
        unitPrice: formatAmountInput(Number(next.price.toFixed(6)), locale, 6),
      }))
    } catch (e) {
      setQuote(null)
      setError(errorMessage(e, t))
    } finally {
      setQuoting(false)
    }
  }

  const refreshPrice = async () => {
    if (!asset) return
    try {
      const updated = await refresh.mutateAsync(asset.id)
      setQuote(cachedQuote(updated))
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const submit = async () => {
    const payload = toAssetPayload(v, locale, asset)
    if (!payload.ok) return setError(t(payload.error.key, payload.error.params))
    setError(null)
    let regenerateGrowth = false
    if (asset && growthParamsChanged(v, asset, locale) && (asset.value_count ?? 0) > 0) {
      // The server regenerates every rule-made value; manual ones stay. Cancel keeps the asset as is.
      if (!(await confirmDestructive(t('assets.confirmRegenerateTitle'), t('assets.confirmRegenerate'), t('assets.regenerate')))) return
      regenerateGrowth = true
    }
    try {
      const saved = await save.mutateAsync({ id: asset?.id, body: payload.value, regenerateGrowth })
      if (asset) router.back()
      else router.replace({ pathname: '/assets/[id]', params: { id: saved.id } })
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const amount = (text: string) => (text.trim() ? parseAmountInput(text, locale) : null)
  const units = amount(v.units)
  const buyTotal = !asset && market && units && units > 0 ? units * (amount(v.unitPrice) ?? quote?.price ?? 0) : null
  const projected =
    v.method === 'growth_rule'
      ? projectGrowth({
          base: amount(v.purchasePrice),
          rate: amount(v.growthRate),
          type: v.growthType,
          frequency: v.growthFrequency,
          start: v.growthStartDate ?? v.purchaseDate,
        })
      : null
  const base = amount(v.purchasePrice) ?? 0
  const groupName = groups.find((g) => g.id === v.groupId)?.name ?? null

  return (
    <Screen>
      <Stack.Screen options={{ title: asset ? t('assets.editAsset') : t('assets.addAsset') }} />
      <TextField label={t('assets.name')} value={v.name} onChangeText={(name) => set({ name })} />
      <PickerField label={t('assets.wallet')} value={groupName} placeholder={t('assets.noWallet')} onPress={() => setPicking('group')} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <PickerField
            label={t('assets.type')}
            value={t(`assets.types.${v.type}`, { defaultValue: v.type })}
            placeholder=""
            onPress={() => setPicking('type')}
          />
        </View>
        <View style={styles.currency}>
          <PickerField label={t('assets.currency')} value={v.currency} placeholder="" onPress={() => setPicking('currency')} />
        </View>
      </View>

      <Text variant="label" tone="muted">
        {t('assets.valuationMethod')}
      </Text>
      <SegmentedControl<ValuationMethod>
        options={[
          { value: 'manual', label: t('assets.manual') },
          { value: 'growth_rule', label: t('assets.growthRule') },
          { value: 'market_price', label: t('assets.marketPrice') },
        ]}
        value={v.method}
        onChange={(method) => set({ method })}
      />

      {market ? (
        <View style={styles.group}>
          <TextField
            label={t('assets.ticker')}
            value={query}
            editable={!asset}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={t('assets.tickerPlaceholder')}
            onChangeText={(text) => {
              setQuery(text)
              // A different symbol than the quoted one: drop the stale price so it can't be saved.
              if (quote && text.trim().toUpperCase() !== quote.symbol.toUpperCase()) {
                setQuote(null)
                set({ ticker: null, tickerExchange: null })
              }
            }}
          />
          {searching && debounced.trim() ? (
            <Card style={styles.list}>
              {matches.isPending || quoting ? (
                <ActivityIndicator color={colors.primary} style={styles.spinner} />
              ) : matches.isError ? (
                <ListRow title={errorMessage(matches.error, t)} />
              ) : (matches.data ?? []).length === 0 ? (
                <ListRow title={t('assets.noMatches')} />
              ) : (
                matches.data!.map((match) => (
                  <ListRow
                    key={`${match.symbol}-${match.exchange ?? ''}`}
                    title={displaySymbol(match)}
                    subtitle={[match.symbol.startsWith('TD:') ? null : match.name, match.exchange].filter(Boolean).join(' · ')}
                    onPress={() => void pickMatch(match)}
                  />
                ))
              )}
            </Card>
          ) : null}
          {quoting && !searching ? <ActivityIndicator color={colors.primary} /> : null}
          {quote ? (
            <Card>
              <View style={styles.quote}>
                <View style={styles.flex}>
                  <Text variant="label">{displaySymbol(quote)}</Text>
                  {quote.name && !quote.symbol.startsWith('TD:') ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {quote.name}
                    </Text>
                  ) : null}
                  {asset?.last_price_at ? (
                    <Text variant="caption" tone="muted">
                      {t('assets.lastUpdated', { when: formatRelative(asset.last_price_at, i18n.language) })}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.quotePrice}>
                  <Text variant="heading">{formatCurrency(quote.price, quote.currency, locale)}</Text>
                  {quote.exchange ? (
                    <Text variant="caption" tone="muted">
                      {quote.exchange}
                    </Text>
                  ) : null}
                </View>
              </View>
              {asset ? <Button label={t('assets.refreshPrice')} variant="secondary" onPress={refreshPrice} loading={refresh.isPending} /> : null}
            </Card>
          ) : null}
          {asset ? (
            ledgerBacked ? (
              <Text variant="caption" tone="muted">
                {t('assets.ledgerBackedHint')}
              </Text>
            ) : (
              <TextField label={t('assets.quantity')} value={v.units} onChangeText={(text) => set({ units: text })} keyboardType="decimal-pad" />
            )
          ) : (
            <View style={styles.row}>
              <View style={styles.flex}>
                <TextField label={t('assets.quantity')} value={v.units} onChangeText={(text) => set({ units: text })} keyboardType="decimal-pad" placeholder="10" />
              </View>
              <View style={styles.flex}>
                <TextField
                  label={t('assets.unitPrice')}
                  value={v.unitPrice}
                  onChangeText={(unitPrice) => set({ unitPrice })}
                  keyboardType="decimal-pad"
                  placeholder={quote ? formatAmountInput(quote.price, locale, 6) : '0'}
                />
              </View>
            </View>
          )}
          {buyTotal != null ? (
            <View style={styles.total}>
              <Text variant="label" tone="muted">
                {t('assets.txTotal')}
              </Text>
              <Text variant="heading">{formatCurrency(buyTotal, quote?.currency ?? v.currency, locale)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {v.method === 'growth_rule' ? (
        <View style={styles.group}>
          <Text variant="label" tone="muted">
            {t('assets.growthType')}
          </Text>
          <SegmentedControl
            options={GROWTH_TYPES.map((value) => ({ value, label: t(`assets.${value}`) }))}
            value={v.growthType}
            onChange={(growthType) => set({ growthType })}
          />
          <View style={styles.row}>
            <View style={styles.flex}>
              <TextField
                label={v.growthType === 'percentage' ? t('assets.growthRatePercent') : t('assets.growthRate')}
                value={v.growthRate}
                onChangeText={(growthRate) => set({ growthRate })}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.flex}>
              <PickerField label={t('assets.growthFrequency')} value={t(`assets.${v.growthFrequency}`)} placeholder="" onPress={() => setPicking('frequency')} />
            </View>
          </View>
          <OptionalDateField
            label={t('assets.growthStartDate')}
            value={v.growthStartDate}
            onChange={(growthStartDate) => set({ growthStartDate })}
            placeholder={t('assets.sameAsPurchase')}
          />
        </View>
      ) : null}

      {ledgerBacked ? null : (
        <OptionalDateField label={t('assets.purchaseDate')} value={v.purchaseDate} onChange={(purchaseDate) => set({ purchaseDate })} />
      )}
      {market ? null : (
        <>
          <TextField label={t('assets.purchasePrice')} value={v.purchasePrice} onChangeText={(purchasePrice) => set({ purchasePrice })} keyboardType="decimal-pad" />
          <OptionalDateField label={t('assets.sellDate')} value={v.sellDate} onChange={(sellDate) => set({ sellDate })} placeholder={t('assets.notSold')} />
          {v.sellDate ? (
            <TextField label={t('assets.sellPrice')} value={v.sellPrice} onChangeText={(sellPrice) => set({ sellPrice })} keyboardType="decimal-pad" />
          ) : null}
        </>
      )}
      {!asset && v.method === 'manual' ? (
        <TextField label={t('assets.currentValue')} value={v.currentValue} onChangeText={(currentValue) => set({ currentValue })} keyboardType="decimal-pad" />
      ) : null}

      {projected != null ? (
        <View style={styles.total}>
          <View>
            <Text variant="label" tone="muted">
              {t('assets.currentValue')}
            </Text>
            {base > 0 ? (
              <Text variant="caption" tone={projected >= base ? 'income' : 'expense'}>
                {`${projected >= base ? '+' : ''}${formatCurrency(projected - base, v.currency, locale)}`}
              </Text>
            ) : null}
          </View>
          <Text variant="heading" tone={projected >= base ? 'income' : 'expense'}>
            {formatCurrency(projected, v.currency, locale)}
          </Text>
        </View>
      ) : null}

      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={save.isPending} disabled={quoting} />

      <SelectSheet
        visible={picking === 'group'}
        title={t('assets.wallet')}
        options={groups.map((g) => ({ value: g.id, label: g.name, color: g.color }))}
        selected={v.groupId}
        noneLabel={t('assets.noWallet')}
        onSelect={(groupId) => {
          set({ groupId })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'type'}
        title={t('assets.type')}
        options={ASSET_TYPES.map((value) => ({ value, label: t(`assets.types.${value}`) }))}
        selected={v.type}
        onSelect={(type) => {
          if (type) set({ type })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'currency'}
        title={t('assets.currency')}
        options={currencies.map((c) => ({ value: c.code, label: `${c.flag ?? ''} ${c.code}`.trim(), detail: c.name }))}
        selected={v.currency}
        onSelect={(code) => {
          if (code) set({ currency: code })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'frequency'}
        title={t('assets.growthFrequency')}
        options={GROWTH_FREQUENCIES.map((value) => ({ value, label: t(`assets.${value}`) }))}
        selected={v.growthFrequency}
        onSelect={(frequency) => {
          if (frequency) set({ growthFrequency: frequency as GrowthFrequency })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  currency: { width: 120 },
  group: { gap: spacing.md },
  list: { padding: 0, overflow: 'hidden' },
  spinner: { padding: spacing.lg },
  quote: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  quotePrice: { alignItems: 'flex-end' },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
})
