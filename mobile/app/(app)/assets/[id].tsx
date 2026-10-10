import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { AssetIcon } from '@/features/assets/AssetIcon'
import { formatProfit, formatUnits } from '@/features/assets/AssetRow'
import {
  useAsset,
  useAssetGroups,
  useAssetTransactions,
  useAssetValues,
  useAssetValueTrend,
  useDeleteAsset,
  useDeleteValue,
  useRefreshPrice,
  useSaveAsset,
} from '@/features/assets/hooks'
import { LedgerRow } from '@/features/assets/LedgerRow'
import { assetProfit, displaySymbol, isProviderOwned, trendWithPurchase, valueHistory, type Asset, type AssetValue } from '@/features/assets/model'
import { TrendChart } from '@/features/assets/TrendChart'
import { useCanWrite, useDisplayFormat } from '@/features/session/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { formatDate, formatRelative } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatCurrency } from '@/lib/format'
import { spacing } from '@/theme'

export default function AssetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const asset = useAsset(id)
  if (asset.isPending) return <Loading />
  if (asset.isError) return <ErrorState error={asset.error} onRetry={() => asset.refetch()} />
  return <AssetDetail asset={asset.data} onRefresh={() => void asset.refetch()} refreshing={asset.isRefetching} />
}

function AssetDetail({ asset, onRefresh, refreshing }: { asset: Asset; onRefresh: () => void; refreshing: boolean }) {
  const { t, i18n } = useTranslation()
  const { locale, dateLocale, currency: primary } = useDisplayFormat()
  const canWrite = useCanWrite()
  const market = asset.valuation_method === 'market_price'
  const providerOwned = isProviderOwned(asset)
  const editable = canWrite && !providerOwned
  const group = useAssetGroups().data?.find((g) => g.id === asset.group_id)
  const trend = useAssetValueTrend(asset.id)
  const values = useAssetValues(asset.id)
  const ledger = useAssetTransactions(asset.id, { enabled: market })
  const refreshPrice = useRefreshPrice()
  const save = useSaveAsset()
  const remove = useDeleteAsset()
  const removeValue = useDeleteValue()
  const profit = assetProfit(asset)
  const money = (value: number | null | undefined) => formatCurrency(value, asset.currency, locale)

  const refresh = () => {
    onRefresh()
    void trend.refetch()
    void values.refetch()
    if (market) void ledger.refetch()
  }

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action()
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  const confirmDelete = async () => {
    if (!(await confirmDestructive(t('assets.confirmDeleteTitle'), t('assets.confirmDelete')))) return
    await run(async () => {
      await remove.mutateAsync(asset.id)
      router.back()
    })
  }

  const confirmDeleteValue = async (value: AssetValue) => {
    if (!(await confirmDestructive(t('assets.deleteValueTitle'), t('assets.deleteValueBody', { amount: money(Number(value.amount)) })))) return
    await run(() => removeValue.mutateAsync(value.id))
  }

  const series = trendWithPurchase(trend.data ?? [], asset).map((p) => ({ date: p.date, value: Number(p.amount) }))
  const history = valueHistory(values.data ?? [], asset)
  const facts: [string, string][] = [
    market && asset.units != null ? [t('assets.quantity'), formatUnits(asset.units, locale)] : null,
    asset.average_price != null ? [t('assets.colAvgPrice'), money(asset.average_price)] : null,
    market && asset.last_price != null
      ? [
          t('assets.colCurrentPrice'),
          [money(asset.last_price), asset.last_price_at ? formatRelative(asset.last_price_at, i18n.language) : null].filter(Boolean).join(' · '),
        ]
      : null,
    asset.total_invested != null ? [t('assets.totalInvested'), money(asset.total_invested)] : null,
    asset.purchase_date ? [t('assets.purchaseDate'), formatDate(asset.purchase_date, dateLocale)] : null,
    !market && asset.purchase_price != null ? [t('assets.purchasePrice'), money(asset.purchase_price)] : null,
    asset.sell_date ? [t('assets.sellDate'), formatDate(asset.sell_date, dateLocale)] : null,
    asset.sell_price != null ? [t('assets.sellPrice'), money(asset.sell_price)] : null,
    asset.maturity_date ? [t('assets.maturityDate'), formatDate(asset.maturity_date, dateLocale)] : null,
    asset.valuation_method === 'growth_rule' && asset.growth_rate != null
      ? [
          t('assets.growthRule'),
          t('assets.growthSummary', {
            rate: asset.growth_type === 'absolute' ? money(asset.growth_rate) : `${asset.growth_rate}%`,
            frequency: t(`assets.${asset.growth_frequency ?? 'monthly'}`).toLowerCase(),
          }),
        ]
      : null,
  ].filter((fact): fact is [string, string] => fact !== null)

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Stack.Screen
        options={{
          title: displaySymbol(asset),
          headerRight: editable
            ? () => (
                <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/assets/form', params: { id: asset.id } })} hitSlop={12}>
                  <Text tone="primary" variant="label">
                    {t('common.edit')}
                  </Text>
                </Pressable>
              )
            : undefined,
        }}
      />

      <Card>
        <View style={styles.header}>
          <AssetIcon type={asset.type} logoUrl={asset.logo_url} size={44} />
          <View style={styles.flex}>
            <Text variant="heading" numberOfLines={2}>
              {asset.name}
            </Text>
            <Text variant="caption" tone="muted">
              {[
                t(`assets.types.${asset.type}`, { defaultValue: asset.type }),
                group?.name,
                asset.is_archived ? t('assets.archived') : null,
                asset.source && asset.source !== 'manual' ? t('assets.synced') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>
        <AmountText variant="title" value={asset.sell_date ? (asset.sell_price ?? null) : asset.current_value} currency={asset.currency} />
        {asset.currency !== primary && asset.current_value_primary != null && !asset.sell_date ? (
          <AmountText variant="caption" tone="muted" value={asset.current_value_primary} currency={primary} />
        ) : null}
        {profit ? (
          <Text variant="label" tone={profit.amount >= 0 ? 'income' : 'expense'}>
            {formatProfit(profit, asset.currency, locale)}
          </Text>
        ) : null}
        {providerOwned ? (
          <Text variant="caption" tone="muted">
            {t('assets.syncedReadOnly')}
          </Text>
        ) : null}
        {market && !asset.average_price && !asset.sell_date ? (
          <Text variant="caption" tone="muted">
            {t('assets.noPriceWarning')}
          </Text>
        ) : null}
      </Card>

      {facts.length ? (
        <Card style={styles.list}>
          {facts.map(([label, value]) => (
            <ListRow key={label} title={label} trailing={<Text variant="label">{value}</Text>} />
          ))}
        </Card>
      ) : null}

      {market && canWrite ? (
        <Button
          label={t('assets.refreshPrice')}
          variant="secondary"
          onPress={() => void run(() => refreshPrice.mutateAsync(asset.id))}
          loading={refreshPrice.isPending}
        />
      ) : null}

      {series.length > 1 ? (
        <Card>
          <Text variant="label" tone="muted">
            {t('assets.valueTrend')}
          </Text>
          <TrendChart series={series} accessibilityLabel={t('assets.valueTrendChart', { name: asset.name })} />
        </Card>
      ) : null}

      {market ? (
        <>
          <SectionHeader title={t('assets.ledgerTitle')} />
          <Card style={styles.list}>
            {ledger.isPending ? (
              <Loading />
            ) : ledger.isError ? (
              <ErrorState error={ledger.error} onRetry={() => ledger.refetch()} />
            ) : ledger.data.length === 0 ? (
              <ListRow title={t('assets.noLedgerYet')} />
            ) : (
              ledger.data.map((tx) => <LedgerRow key={tx.id} tx={tx} currency={asset.currency} editable={canWrite} />)
            )}
          </Card>
          {canWrite && !asset.sell_date ? (
            <Button
              label={t('assets.addTransaction')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/assets/transaction', params: { assetId: asset.id } })}
            />
          ) : null}
        </>
      ) : (
        <>
          <SectionHeader title={t('assets.valueHistory')} />
          <Card style={styles.list}>
            {values.isPending ? (
              <Loading />
            ) : values.isError ? (
              <ErrorState error={values.error} onRetry={() => values.refetch()} />
            ) : history.length === 0 ? (
              <ListRow title={t('assets.noValues')} />
            ) : (
              history.map((value, index) => {
                const previous = history[index + 1]
                const change = previous ? Number(value.amount) - Number(previous.amount) : null
                const deletable = editable && asset.valuation_method === 'manual' && value.source === 'manual'
                return (
                  <ListRow
                    key={value.id}
                    title={money(Number(value.amount))}
                    subtitle={[
                      formatDate(value.date, dateLocale),
                      t(`assets.sources.${value.source}`, { defaultValue: value.source }),
                    ].join(' · ')}
                    onPress={deletable ? () => void confirmDeleteValue(value) : undefined}
                    accessibilityLabel={deletable ? t('assets.deleteValueLabel', { amount: money(Number(value.amount)) }) : undefined}
                    trailing={
                      change != null && change !== 0 ? (
                        <Text variant="caption" tone={change > 0 ? 'income' : 'expense'}>
                          {`${change > 0 ? '+' : ''}${money(change)}`}
                        </Text>
                      ) : null
                    }
                  />
                )
              })
            )}
          </Card>
          {editable && asset.valuation_method === 'manual' ? (
            <Button
              label={t('assets.addValue')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/assets/value', params: { assetId: asset.id } })}
            />
          ) : null}
        </>
      )}

      {editable ? (
        <View style={styles.actions}>
          <Button
            label={asset.is_archived ? t('assets.unarchive') : t('assets.archive')}
            variant="ghost"
            onPress={() => void run(() => save.mutateAsync({ id: asset.id, body: { is_archived: !asset.is_archived } }))}
            loading={save.isPending}
          />
          <Button label={t('common.delete')} variant="ghost" onPress={confirmDelete} loading={remove.isPending} />
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  list: { padding: 0, overflow: 'hidden' },
  actions: { gap: spacing.sm, marginBottom: spacing.xl },
})
