import * as DocumentPicker from 'expo-document-picker'
import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { SelectSheet } from '@/components/SelectSheet'
import { Text } from '@/components/Text'
import { useAssetGroups } from '@/features/assets/hooks'
import {
  ASSET_IMPORT_FIELDS,
  fetchAssetPreview,
  shareAssetTemplate,
  useImportAssetOrders,
  type AssetImportField,
  type AssetImportOptions,
  type AssetImportPreview,
} from '@/features/assets/import'
import { useDisplayFormat } from '@/features/session/hooks'
import { showError } from '@/lib/confirm'
import { formatDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import type { PickedFile } from '@/lib/upload'
import { spacing, useColors } from '@/theme'

const MAX_ERRORS = 8
const MAX_ROWS = 50

/** Import buy/sell orders from a CSV: pick, map columns if needed, choose a wallet, review, import. */
export default function AssetImportScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const { dateLocale } = useDisplayFormat()
  const wallets = useAssetGroups().data ?? []
  const importOrders = useImportAssetOrders()
  const [file, setFile] = useState<PickedFile | null>(null)
  const [preview, setPreview] = useState<AssetImportPreview | null>(null)
  const [options, setOptions] = useState<AssetImportOptions>({ columnMapping: {}, groupId: null })
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<AssetImportField | 'wallet' | null>(null)

  // Re-preview on every change, so what's on screen is the import that would run.
  const runPreview = async (selected: PickedFile, next: AssetImportOptions) => {
    setLoading(true)
    setError(null)
    try {
      setPreview(await fetchAssetPreview(selected, next))
    } catch (e) {
      setPreview(null)
      setError(errorMessage(e, t))
    } finally {
      setLoading(false)
    }
  }

  const update = (patch: Partial<AssetImportOptions>) => {
    const next = { ...options, ...patch }
    setOptions(next)
    if (file) void runPreview(file, next)
  }

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: '*/*' })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    if (asset.name.split('.').pop()?.toLowerCase() !== 'csv') {
      Alert.alert(t('assets.import.csvOnlyTitle'), t('assets.import.csvOnlyBody'))
      return
    }
    const picked = { uri: asset.uri, name: asset.name, mimeType: asset.mimeType }
    const next = { ...options, columnMapping: {} }
    setFile(picked)
    setPreview(null)
    setOptions(next)
    void runPreview(picked, next)
  }

  const reset = () => {
    setFile(null)
    setPreview(null)
    setError(null)
    setOptions({ columnMapping: {}, groupId: options.groupId })
  }

  const downloadTemplate = async () => {
    setSharing(true)
    try {
      await shareAssetTemplate(t('assets.import.downloadTemplate'))
    } catch (e) {
      showError(errorMessage(e, t))
    } finally {
      setSharing(false)
    }
  }

  const submit = async () => {
    if (!preview || preview.orders.length === 0) return
    try {
      const result = await importOrders.mutateAsync({ preview, groupId: options.groupId, filename: file?.name ?? null })
      Alert.alert(t('assets.import.doneTitle'), t('assets.import.imported', { count: result.imported }))
      router.back()
    } catch (e) {
      setError(errorMessage(e, t))
    }
  }

  const needsMapping = Boolean(preview?.parse_error)
  const orders = preview?.orders ?? []
  const rowErrors = preview?.errors ?? []
  const warnings = preview?.warnings ?? []
  const walletName = wallets.find((w) => w.id === options.groupId)?.name ?? null

  return (
    <Screen>
      <Card>
        <Text variant="heading">{file ? file.name : t('assets.import.choose')}</Text>
        <Text variant="caption" tone="muted">
          {preview && !needsMapping ? t('assets.import.summaryOrders', { count: orders.length }) : t('assets.import.chooseHint')}
        </Text>
        <Button label={file ? t('assets.import.chooseAnother') : t('assets.import.choose')} onPress={pick} disabled={loading} />
        {file ? (
          <Button label={t('assets.import.removeFile')} variant="ghost" onPress={reset} />
        ) : (
          <Button label={t('assets.import.downloadTemplate')} variant="ghost" onPress={downloadTemplate} loading={sharing} />
        )}
      </Card>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text tone="muted">{t('assets.import.reading')}</Text>
        </View>
      ) : null}
      {error ? <Text tone="destructive">{error}</Text> : null}

      {needsMapping && preview ? (
        <>
          <Text variant="caption" tone="muted">
            {t('assets.import.mapPrompt')}
          </Text>
          {ASSET_IMPORT_FIELDS.map(({ key, required }) => (
            <PickerField
              key={key}
              label={`${t(`assets.import.field.${key}`)}${required ? ' *' : ''}`}
              value={options.columnMapping[key] ?? null}
              placeholder={t('assets.import.ignoreColumn')}
              onPress={() => setPicking(key)}
            />
          ))}
        </>
      ) : null}

      {preview && !needsMapping ? (
        <>
          <Card>
            <Text variant="label">{t('assets.import.summaryOrders', { count: orders.length })}</Text>
            <Text variant="caption" tone="muted">
              {t('assets.import.summaryHoldings', { created: preview.holdings_created ?? 0, matched: preview.holdings_matched ?? 0 })}
            </Text>
            {preview.skipped ? (
              <Text variant="caption" tone="muted">
                {t('assets.import.summarySkipped', { count: preview.skipped })}
              </Text>
            ) : null}
          </Card>

          <PickerField label={t('assets.import.importTo')} value={walletName} placeholder={t('assets.noWallet')} onPress={() => setPicking('wallet')} />

          {warnings.length ? (
            <Card>
              <Text variant="label">{t('assets.import.walletWarningTitle')}</Text>
              {warnings.map((w) => (
                <Text key={`${w.ticker}-${w.reason}`} variant="caption" tone="muted">
                  {t(`assets.import.warning.${w.reason}`, { ticker: w.ticker, wallet: w.wallet ?? '—', defaultValue: w.reason })}
                </Text>
              ))}
            </Card>
          ) : null}

          {rowErrors.length ? (
            <Card>
              <Text variant="label" tone="expense">
                {t('assets.import.rowsSkipped', { count: rowErrors.length })}
              </Text>
              {rowErrors.slice(0, MAX_ERRORS).map((e) => (
                <Text key={`${e.row}-${e.reason}`} variant="caption" tone="muted">
                  {t('assets.import.rowError', {
                    row: e.row,
                    ticker: e.ticker ?? '—',
                    reason: t(`assets.import.reason.${e.reason}`, { defaultValue: e.reason }),
                  })}
                  {e.detail ? ` (${e.detail})` : ''}
                </Text>
              ))}
              {rowErrors.length > MAX_ERRORS ? (
                <Text variant="caption" tone="muted">
                  {t('assets.import.moreErrors', { count: rowErrors.length - MAX_ERRORS })}
                </Text>
              ) : null}
            </Card>
          ) : null}

          {orders.length ? (
            <>
              <SectionHeader title={t('assets.import.ordersTitle')} />
              <Card style={styles.list}>
                {orders.slice(0, MAX_ROWS).map((order) => (
                  <ListRow
                    key={order.row}
                    title={`${order.ticker} · ${t(`assets.import.kind.${order.kind}`, { defaultValue: order.kind })}`}
                    subtitle={[formatDate(order.date, dateLocale), Number(order.fee) ? `${t('assets.txFee')} ${order.fee}` : null].filter(Boolean).join(' · ')}
                    trailing={
                      <Text variant="label" tone={order.kind === 'sell' ? 'income' : 'default'}>
                        {`${order.quantity} × ${order.price}`}
                      </Text>
                    }
                  />
                ))}
              </Card>
              {orders.length > MAX_ROWS ? (
                <Text variant="caption" tone="muted">
                  {t('assets.import.moreRows', { count: orders.length - MAX_ROWS })}
                </Text>
              ) : null}
            </>
          ) : (
            <Text tone="muted">{t('assets.import.nothingToImport')}</Text>
          )}

          <Button
            label={t('assets.import.confirm', { count: orders.length })}
            onPress={submit}
            loading={importOrders.isPending}
            disabled={orders.length === 0 || loading}
          />
        </>
      ) : null}

      <SelectSheet
        visible={picking !== null && picking !== 'wallet'}
        title={picking && picking !== 'wallet' ? t(`assets.import.field.${picking}`) : ''}
        options={(preview?.csv_columns ?? []).map((column) => ({ value: column, label: column }))}
        selected={picking && picking !== 'wallet' ? (options.columnMapping[picking] ?? null) : null}
        noneLabel={t('assets.import.ignoreColumn')}
        onSelect={(column) => {
          if (picking && picking !== 'wallet') {
            const columnMapping = { ...options.columnMapping, [picking]: column ?? undefined }
            if (!column) delete columnMapping[picking]
            update({ columnMapping })
          }
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'wallet'}
        title={t('assets.import.importTo')}
        options={wallets.map((w) => ({ value: w.id, label: w.name, color: w.color }))}
        selected={options.groupId}
        noneLabel={t('assets.noWallet')}
        onSelect={(groupId) => {
          update({ groupId })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
})
