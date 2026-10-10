import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Card } from '@/components/Card'
import { Fab } from '@/components/Fab'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { AssetRow } from '@/features/assets/AssetRow'
import { useAssetGroups, useAssets, usePortfolioTrend } from '@/features/assets/hooks'
import { portfolioTotal, sectionAssets, type AssetSection } from '@/features/assets/model'
import { PortfolioChart } from '@/features/assets/TrendChart'
import { useCanWrite, useDisplayFormat } from '@/features/session/hooks'
import { spacing, useColors } from '@/theme'

export default function AssetsScreen() {
  const { t } = useTranslation()
  const { currency } = useDisplayFormat()
  const canWrite = useCanWrite()
  const [showArchived, setShowArchived] = useState(false)
  const assets = useAssets({ includeArchived: showArchived })
  const groups = useAssetGroups()
  const trend = usePortfolioTrend()

  if (assets.isPending || groups.isPending) return <Loading />
  if (assets.isError) return <ErrorState error={assets.error} onRetry={() => assets.refetch()} />
  if (groups.isError) return <ErrorState error={groups.error} onRetry={() => groups.refetch()} />

  const { sections, sold, archived } = sectionAssets(assets.data, groups.data)
  const current = sections.flatMap((s) => s.assets)
  const refresh = () => {
    void assets.refetch()
    void groups.refetch()
    void trend.refetch()
  }

  return (
    <View style={styles.root}>
      <Screen onRefresh={refresh} refreshing={assets.isRefetching}>
        <Card>
          <Text variant="label" tone="muted">
            {t('assets.portfolioValue')}
          </Text>
          <AmountText variant="title" value={portfolioTotal(current)} currency={currency} />
          {trend.data && trend.data.trend.length > 1 ? <PortfolioChart data={trend.data} wallets={groups.data} /> : null}
        </Card>

        <Card style={styles.list}>
          <ListRow title={t('assets.allTransactions')} onPress={() => router.push('/assets/transactions')} showChevron />
          {canWrite ? <ListRow title={t('assets.import.title')} onPress={() => router.push('/assets/import')} showChevron /> : null}
          {canWrite ? <ListRow title={t('assets.newWallet')} onPress={() => router.push('/assets/group')} showChevron /> : null}
        </Card>

        {current.length === 0 && sections.length === 0 && sold.length === 0 && archived.length === 0 ? (
          <EmptyState title={t('assets.emptyTitle')} body={t('assets.emptyBody')} />
        ) : null}

        {sections.map((section) => (
          <WalletSection key={section.groupId ?? 'ungrouped'} section={section} canWrite={canWrite} hasWallets={groups.data.length > 0} />
        ))}

        {sold.length ? (
          <>
            <SectionHeader title={t('assets.soldAssets')} />
            <Card style={styles.list}>
              {sold.map((asset) => (
                <AssetRow key={asset.id} asset={asset} />
              ))}
            </Card>
          </>
        ) : null}

        {showArchived && archived.length ? (
          <>
            <SectionHeader title={t('assets.archivedAssets')} />
            <Card style={styles.list}>
              {archived.map((asset) => (
                <AssetRow key={asset.id} asset={asset} />
              ))}
            </Card>
          </>
        ) : null}

        <SwitchField label={t('assets.showArchived')} value={showArchived} onChange={setShowArchived} />
        <View style={styles.fabSpace} />
      </Screen>
      {canWrite ? <Fab label={t('assets.addAsset')} onPress={() => router.push('/assets/form')} /> : null}
    </View>
  )
}

function WalletSection({ section, canWrite, hasWallets }: { section: AssetSection; canWrite: boolean; hasWallets: boolean }) {
  const { t } = useTranslation()
  const colors = useColors()
  const { currency } = useDisplayFormat()
  const { group } = section
  const title = group ? group.name : hasWallets ? t('assets.ungrouped') : t('assets.activeAssets')
  const header = (
    <View style={styles.walletHeader}>
      {group ? <View style={[styles.dot, { backgroundColor: group.color ?? colors.primary }]} /> : null}
      <Text variant="label" tone="muted" style={styles.walletName} numberOfLines={1}>
        {title.toUpperCase()}
      </Text>
      {group ? <AmountText variant="caption" tone="muted" value={group.current_value_primary ?? group.current_value} currency={currency} /> : null}
    </View>
  )
  return (
    <View>
      {group && canWrite ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('assets.editWalletNamed', { name: group.name })}
          onPress={() => router.push({ pathname: '/assets/group', params: { id: group.id } })}
        >
          {header}
        </Pressable>
      ) : (
        header
      )}
      <Card style={styles.list}>
        {section.assets.length ? (
          section.assets.map((asset) => <AssetRow key={asset.id} asset={asset} />)
        ) : (
          <ListRow title={t('assets.emptyWallet')} />
        )}
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 0, overflow: 'hidden' },
  fabSpace: { height: 72 },
  walletHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.sm },
  walletName: { flex: 1, letterSpacing: 0.5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
})
