import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { ListRow } from '@/components/ListRow'
import { Text } from '@/components/Text'
import { useDisplayFormat } from '@/features/session/hooks'
import { formatCurrency } from '@/lib/format'
import { AssetIcon } from './AssetIcon'
import { assetProfit, displaySymbol, type Asset } from './model'

export function formatUnits(value: number | null | undefined, locale: string): string {
  return value == null ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: 8 }).format(value)
}

/** "+$12.00 (3.4%)" for a gain, "−$5.00 (−1.2%)" for a loss. */
export function formatProfit(profit: { amount: number; percentage: number | null }, currency: string, locale: string): string {
  const sign = profit.amount > 0 ? '+' : ''
  const pct = profit.percentage == null ? '' : ` (${profit.percentage > 0 ? '+' : ''}${profit.percentage.toFixed(2)}%)`
  return `${sign}${formatCurrency(profit.amount, currency, locale)}${pct}`
}

/** One holding: symbol, quantity or type, flags, current value and return. */
export function AssetRow({ asset }: { asset: Asset }) {
  const { t } = useTranslation()
  const { locale } = useDisplayFormat()
  const profit = assetProfit(asset)
  const market = asset.valuation_method === 'market_price'
  const needsBuys = market && asset.average_price == null && !asset.sell_date

  const detail =
    market && asset.units != null
      ? [
          `${formatUnits(asset.units, locale)} ${t('assets.unitsShort')}`,
          asset.average_price != null ? `${t('assets.avgPriceShort')} ${formatCurrency(asset.average_price, asset.currency, locale)}` : null,
        ]
      : [t(`assets.types.${asset.type}`, { defaultValue: asset.type })]
  const flags = [
    asset.sell_date ? t('assets.sold') : null,
    asset.source && asset.source !== 'manual' ? t('assets.synced') : null,
    needsBuys ? t('assets.noPriceBadge') : null,
  ]

  return (
    <ListRow
      title={displaySymbol(asset)}
      subtitle={[...detail, ...flags].filter(Boolean).join(' · ')}
      leading={<AssetIcon type={asset.type} logoUrl={asset.logo_url} />}
      onPress={() => router.push({ pathname: '/assets/[id]', params: { id: asset.id } })}
      trailing={
        <View style={styles.trailing}>
          <AmountText variant="label" value={asset.sell_date ? (asset.sell_price ?? null) : asset.current_value} currency={asset.currency} />
          {profit ? (
            <Text variant="caption" tone={profit.amount >= 0 ? 'income' : 'expense'}>
              {formatProfit(profit, asset.currency, locale)}
            </Text>
          ) : null}
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  trailing: { alignItems: 'flex-end', maxWidth: '50%' },
})
