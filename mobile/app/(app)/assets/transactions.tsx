import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Card } from '@/components/Card'
import { Fab } from '@/components/Fab'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { useAssets, useAssetTransactions } from '@/features/assets/hooks'
import { LedgerRow } from '@/features/assets/LedgerRow'
import { displaySymbol } from '@/features/assets/model'
import { useCanWrite } from '@/features/session/hooks'

/** Every buy and sell behind the consolidated holdings. */
export default function AssetLedgerScreen() {
  const { t } = useTranslation()
  const canWrite = useCanWrite()
  const ledger = useAssetTransactions()
  const holdings = useAssets()

  if (ledger.isPending) return <Loading />
  if (ledger.isError) return <ErrorState error={ledger.error} onRetry={() => ledger.refetch()} />

  // Market holdings with no recorded buys can't show an average price or return yet.
  const withoutCost = (holdings.data ?? []).filter(
    (h) => h.valuation_method === 'market_price' && !h.sell_date && h.average_price == null && h.units != null,
  )

  return (
    <View style={styles.root}>
      <Screen onRefresh={() => void ledger.refetch()} refreshing={ledger.isRefetching}>
        <Text variant="caption" tone="muted">
          {t('assets.txTabHint')}
        </Text>
        {withoutCost.length ? (
          <>
            <SectionHeader title={t('assets.needsBuys')} />
            <Card style={styles.list}>
              {withoutCost.map((h) => (
                <ListRow
                  key={h.id}
                  title={displaySymbol(h)}
                  subtitle={t('assets.noPriceWarning')}
                  subtitleLines={2}
                  onPress={canWrite ? () => router.push({ pathname: '/assets/transaction', params: { assetId: h.id } }) : undefined}
                  showChevron={canWrite}
                />
              ))}
            </Card>
          </>
        ) : null}
        {ledger.data.length === 0 ? (
          <EmptyState title={t('assets.noTransactions')} />
        ) : (
          <Card style={styles.list}>
            {ledger.data.map((tx) => (
              <LedgerRow key={tx.id} tx={tx} editable={canWrite} showHolding />
            ))}
          </Card>
        )}
        <View style={styles.fabSpace} />
      </Screen>
      {canWrite ? <Fab label={t('assets.addTransaction')} onPress={() => router.push('/assets/transaction')} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 0, overflow: 'hidden' },
  fabSpace: { height: 72 },
})
