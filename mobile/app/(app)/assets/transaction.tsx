import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { DateField } from '@/components/DateField'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SelectSheet } from '@/components/SelectSheet'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useAssetGroups, useAssets, useAssetTransactions, useDeleteTransaction, useSaveTransaction } from '@/features/assets/hooks'
import {
  displaySymbol,
  toTxRequest,
  txTotal,
  txValuesFrom,
  type Asset,
  type AssetTransaction,
  type TxFormValues,
  type TxKind,
} from '@/features/assets/model'
import { useDisplayFormat } from '@/features/session/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { toIsoDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatCurrency, parseAmountInput } from '@/lib/format'
import { spacing } from '@/theme'

/**
 * Record a buy or sell. `?assetId=` fixes the holding, `&txId=` edits an
 * entry; with neither, pick a holding or buy a new ticker.
 */
export default function AssetTransactionScreen() {
  const { assetId, txId } = useLocalSearchParams<{ assetId?: string; txId?: string }>()
  const holdings = useAssets()
  const ledger = useAssetTransactions(assetId, { enabled: Boolean(assetId && txId) })
  if (holdings.isPending || (txId && ledger.isPending)) return <Loading />
  if (holdings.isError) return <ErrorState error={holdings.error} onRetry={() => holdings.refetch()} />
  const tx = txId ? ledger.data?.find((entry) => entry.id === txId) : undefined
  if (txId && !tx) return <ErrorState error={ledger.error ?? new Error('Not found')} onRetry={() => ledger.refetch()} />
  // Only open market-priced holdings trade through the ledger.
  const market = holdings.data.filter((h) => h.valuation_method === 'market_price' && !h.sell_date)
  return <TransactionForm holdings={market} assetId={assetId} tx={tx} />
}

function TransactionForm({ holdings, assetId, tx }: { holdings: Asset[]; assetId?: string; tx?: AssetTransaction }) {
  const { t } = useTranslation()
  const { locale } = useDisplayFormat()
  const groups = useAssetGroups().data ?? []
  const save = useSaveTransaction()
  const remove = useDeleteTransaction()
  const [picking, setPicking] = useState<'holding' | 'group' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState<TxFormValues>(() =>
    tx
      ? txValuesFrom(tx, locale)
      : {
          holdingId: assetId ?? holdings[0]?.id ?? null,
          ticker: '',
          groupId: null,
          kind: 'buy',
          quantity: '',
          price: '',
          fee: '',
          date: toIsoDate(new Date()),
        },
  )
  const set = (patch: Partial<TxFormValues>) => setV((current) => ({ ...current, ...patch }))
  const holding = holdings.find((h) => h.id === v.holdingId)
  const isNew = !tx && !v.holdingId
  const currency = holding?.currency ?? tx?.currency ?? null

  const quantity = parseAmountInput(v.quantity, locale)
  const price = parseAmountInput(v.price, locale)
  const fee = v.fee.trim() ? (parseAmountInput(v.fee, locale) ?? 0) : 0
  const total = quantity && quantity > 0 && price != null ? txTotal(quantity, price, fee, v.kind) : null

  const submit = async () => {
    const request = toTxRequest(v, locale, { editingId: tx?.id, heldUnits: holding?.units ?? 0 })
    if (!request.ok) return setError(t(request.error.key, request.error.params))
    setError(null)
    try {
      await save.mutateAsync(request.value)
      router.back()
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const confirmDelete = async () => {
    if (!tx || !(await confirmDestructive(t('assets.confirmDeleteTxTitle'), t('assets.confirmDeleteTx')))) return
    try {
      await remove.mutateAsync(tx.id)
      router.back()
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: tx ? t('assets.editTransaction') : t('assets.addTransaction') }} />
      {tx ? (
        <Text variant="heading">{displaySymbol({ ticker: tx.ticker, name: tx.asset_name })}</Text>
      ) : assetId ? (
        <Text variant="heading">{holding ? displaySymbol(holding) : ''}</Text>
      ) : (
        <PickerField
          label={t('assets.holding')}
          value={holding ? displaySymbol(holding) : t('assets.newTicker')}
          placeholder=""
          onPress={() => setPicking('holding')}
        />
      )}

      {isNew ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField
              label={t('assets.ticker')}
              value={v.ticker}
              onChangeText={(ticker) => set({ ticker })}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={t('assets.tickerPlaceholder')}
            />
          </View>
          <View style={styles.flex}>
            <PickerField
              label={t('assets.wallet')}
              value={groups.find((g) => g.id === v.groupId)?.name ?? null}
              placeholder={t('assets.noWallet')}
              onPress={() => setPicking('group')}
            />
          </View>
        </View>
      ) : (
        <SegmentedControl<TxKind>
          options={[
            { value: 'buy', label: t('assets.txBuy') },
            { value: 'sell', label: t('assets.txSell') },
          ]}
          value={v.kind}
          onChange={(kind) => set({ kind })}
        />
      )}

      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField label={t('assets.quantity')} value={v.quantity} onChangeText={(quantity) => set({ quantity })} keyboardType="decimal-pad" />
        </View>
        <View style={styles.flex}>
          <TextField label={t('assets.unitPrice')} value={v.price} onChangeText={(text) => set({ price: text })} keyboardType="decimal-pad" />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField label={t('assets.fee')} value={v.fee} onChangeText={(text) => set({ fee: text })} keyboardType="decimal-pad" placeholder="0" />
        </View>
        <View style={styles.flex}>
          <DateField label={t('assets.date')} value={v.date} onChange={(date) => set({ date })} />
        </View>
      </View>

      {!tx && !isNew && v.kind === 'sell' && holding?.units != null ? (
        <Text variant="caption" tone="muted">
          {t('assets.heldUnits', { units: holding.units })}
        </Text>
      ) : null}
      {total != null ? (
        <View style={styles.total}>
          <Text variant="label" tone="muted">
            {t('assets.txTotal')}
          </Text>
          <Text variant="heading">{formatCurrency(total, currency ?? undefined, locale)}</Text>
        </View>
      ) : null}

      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={save.isPending} />
      {tx ? <Button label={t('common.delete')} variant="ghost" onPress={confirmDelete} loading={remove.isPending} /> : null}

      <SelectSheet
        visible={picking === 'holding'}
        title={t('assets.holding')}
        options={holdings.map((h) => ({ value: h.id, label: displaySymbol(h), detail: h.ticker && !h.ticker.startsWith('TD:') ? h.name : null }))}
        selected={v.holdingId}
        noneLabel={t('assets.newTicker')}
        onSelect={(holdingId) => {
          // A new ticker can only be bought.
          set(holdingId ? { holdingId } : { holdingId: null, kind: 'buy' })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
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
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
})
