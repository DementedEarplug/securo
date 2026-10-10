import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { ListRow } from '@/components/ListRow'
import { Text } from '@/components/Text'
import { useDisplayFormat } from '@/features/session/hooks'
import { formatDate } from '@/lib/dates'
import { formatCurrency } from '@/lib/format'
import { formatUnits } from './AssetRow'
import { displaySymbol, txTotal, type AssetTransaction } from './model'

/**
 * One buy or sell. `showHolding` prefixes the ticker for the portfolio-wide
 * ledger. Tapping opens the editor when the user can write.
 */
export function LedgerRow({
  tx,
  currency,
  editable,
  showHolding = false,
}: {
  tx: AssetTransaction
  currency?: string | null
  editable: boolean
  showHolding?: boolean
}) {
  const { t } = useTranslation()
  const { locale, dateLocale } = useDisplayFormat()
  const cur = tx.currency ?? currency ?? 'USD'
  const kind = tx.kind === 'sell' ? 'sell' : 'buy'
  const verb = kind === 'buy' ? t('assets.txBuy') : t('assets.txSell')
  const title = `${showHolding ? `${displaySymbol({ ticker: tx.ticker, name: tx.asset_name })} · ` : ''}${verb} ${formatUnits(tx.quantity, locale)} × ${formatCurrency(tx.price, cur, locale)}`
  const total = txTotal(tx.quantity, tx.price, tx.fee ?? 0, kind)
  return (
    <ListRow
      title={title}
      subtitle={[
        formatDate(tx.date, dateLocale),
        tx.fee ? `${t('assets.txFee')} ${formatCurrency(tx.fee, cur, locale)}` : null,
        tx.source && tx.source !== 'manual' ? t('assets.synced') : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      onPress={editable ? () => router.push({ pathname: '/assets/transaction', params: { assetId: tx.asset_id, txId: tx.id } }) : undefined}
      trailing={
        <View style={styles.trailing}>
          <Text variant="label" tone={kind === 'buy' ? 'expense' : 'income'}>
            {formatCurrency(kind === 'buy' ? -total : total, cur, locale)}
          </Text>
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  trailing: { alignItems: 'flex-end' },
})
