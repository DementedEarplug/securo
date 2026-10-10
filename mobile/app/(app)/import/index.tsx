import * as DocumentPicker from 'expo-document-picker'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, FlatList, Pressable, StyleSheet, Switch, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SelectSheet, type SelectOption } from '@/components/SelectSheet'
import { Loading } from '@/components/States'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { accountNameById, accountOptions, useAccounts } from '@/features/accounts/hooks'
import {
  DEFAULT_OPTIONS,
  fetchPreview,
  MAPPABLE_FIELDS,
  toImportPayload,
  useRunImport,
  type DateFormat,
  type ImportPreview,
  type MappableField,
  type PickedFile,
  type PreviewOptions,
  type ReviewRow,
} from '@/features/import/api'
import { useDisplayFormat } from '@/features/session/hooks'
import { categoryOptions } from '@/features/transactions/category-options'
import { useCategoryGroups } from '@/features/transactions/hooks'
import { formatDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { spacing, useColors } from '@/theme'

const EXTENSIONS = ['ofx', 'qfx', 'csv', 'qif', 'xml', 'camt']
const DATE_FORMATS: DateFormat[] = ['', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']

type Picking = { kind: 'account' } | { kind: 'category'; index: number } | { kind: 'column'; field: MappableField | 'inflow' | 'outflow' }

export default function ImportScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const { dateLocale } = useDisplayFormat()
  const accounts = (useAccounts().data ?? []).filter((a) => !a.is_closed)
  const categories = categoryOptions(useCategoryGroups().data)
  const runImport = useRunImport()

  const [file, setFile] = useState<PickedFile | null>(null)
  const [options, setOptions] = useState<PreviewOptions>(DEFAULT_OPTIONS)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(false)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [detectDuplicates, setDetectDuplicates] = useState(true)
  const [showOptions, setShowOptions] = useState(false)
  const [splitColumns, setSplitColumns] = useState(false)
  const [picking, setPicking] = useState<Picking | null>(null)

  const loadPreview = async (picked: PickedFile, opts: PreviewOptions) => {
    setLoading(true)
    try {
      const result = await fetchPreview(picked, opts)
      setPreview(result)
      setRows(result.transactions)
      if (result.parse_error) setShowOptions(true)
    } catch (e) {
      Alert.alert(t('common.errorTitle'), errorMessage(e, t))
    } finally {
      setLoading(false)
    }
  }

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: '*/*' })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    const extension = asset.name.split('.').pop()?.toLowerCase() ?? ''
    if (!EXTENSIONS.includes(extension)) {
      Alert.alert(t('import.unsupportedTitle'), t('import.unsupportedBody'))
      return
    }
    const picked = { uri: asset.uri, name: asset.name, mimeType: asset.mimeType }
    setFile(picked)
    setOptions(DEFAULT_OPTIONS)
    setSplitColumns(false)
    setShowOptions(false)
    await loadPreview(picked, DEFAULT_OPTIONS)
  }

  const applyOptions = (next: PreviewOptions) => {
    setOptions(next)
    if (file) void loadPreview(file, next)
  }

  const included = rows.filter((row) => !row.excluded)
  const isCsv = preview?.detected_format === 'csv'
  const isQif = preview?.detected_format === 'qif'
  const columnOptions: SelectOption[] = useMemo(
    () => (preview?.csv_columns ?? []).map((column) => ({ value: column, label: column })),
    [preview],
  )

  const categoryLabel = (row: ReviewRow) => {
    if (row.chosenCategoryId === null) return t('transactions.uncategorized')
    const id = row.chosenCategoryId ?? row.suggested_category_id
    return categories.find((c) => c.value === id)?.label ?? row.suggested_category_name ?? row.category_name ?? t('transactions.uncategorized')
  }

  const submit = async () => {
    if (!accountId || !preview || !file) return
    try {
      const result = await runImport.mutateAsync({
        account_id: accountId,
        transactions: toImportPayload(rows),
        filename: file.name,
        detected_format: preview.detected_format,
        detect_duplicates: isCsv ? detectDuplicates : true,
      })
      Alert.alert(
        t('import.doneTitle'),
        t('import.doneBody', { imported: result.imported, skipped: result.skipped, excluded: result.excluded }),
        [{ text: t('common.close'), onPress: () => router.replace('/import/history') }],
      )
    } catch (e) {
      Alert.alert(t('common.errorTitle'), errorMessage(e, t))
    }
  }

  if (!preview) {
    return (
      <Screen>
        <Text tone="muted">{t('import.intro')}</Text>
        <Button label={t('import.chooseFile')} onPress={pick} loading={loading} />
        <Button label={t('more.items.importLogs')} variant="ghost" onPress={() => router.push('/import/history')} />
        {loading ? <Loading /> : null}
      </Screen>
    )
  }

  const header = (
    <View style={styles.header}>
      <Card>
        <Text variant="label">{file?.name}</Text>
        <Text variant="caption" tone="muted">
          {t('import.summary', { format: preview.detected_format.toUpperCase(), count: rows.length, included: included.length })}
        </Text>
        {preview.failed_rows?.length ? (
          <Text variant="caption" tone="destructive">
            {t('import.failedRows', { count: preview.failed_rows.length })}
          </Text>
        ) : null}
        {preview.parse_error ? (
          <Text variant="caption" tone="destructive">
            {t('import.parseError')}
          </Text>
        ) : null}
        <View style={styles.row}>
          <Button label={t('import.chooseOther')} variant="ghost" onPress={pick} />
          {isCsv || isQif ? (
            <Button label={showOptions ? t('import.hideOptions') : t('import.showOptions')} variant="ghost" onPress={() => setShowOptions(!showOptions)} />
          ) : null}
        </View>
      </Card>

      {showOptions ? (
        <Card>
          <Text variant="label" tone="muted">
            {t('import.dateFormat')}
          </Text>
          <SegmentedControl
            value={options.dateFormat}
            onChange={(dateFormat) => applyOptions({ ...options, dateFormat })}
            options={DATE_FORMATS.map((value) => ({ value, label: value || t('import.auto') }))}
          />
          {isCsv ? (
            <>
              <SwitchField
                label={t('import.flipAmounts')}
                hint={t('import.flipAmountsHint')}
                value={options.flipAmount}
                onChange={(flipAmount) => applyOptions({ ...options, flipAmount })}
              />
              <SwitchField
                label={t('import.splitColumns')}
                hint={t('import.splitColumnsHint')}
                value={splitColumns}
                onChange={(value) => {
                  setSplitColumns(value)
                  if (!value) applyOptions({ ...options, inflowColumn: null, outflowColumn: null })
                }}
              />
              {splitColumns ? (
                <>
                  <PickerField label={t('import.inflowColumn')} value={options.inflowColumn} placeholder={t('import.choose')} onPress={() => setPicking({ kind: 'column', field: 'inflow' })} />
                  <PickerField label={t('import.outflowColumn')} value={options.outflowColumn} placeholder={t('import.choose')} onPress={() => setPicking({ kind: 'column', field: 'outflow' })} />
                </>
              ) : null}
              <SectionHeader title={t('import.columns')} />
              {MAPPABLE_FIELDS.filter((field) => !(splitColumns && field === 'amount')).map((field) => (
                <PickerField
                  key={field}
                  label={t(`import.fields.${field}`)}
                  value={options.columnMapping[field] ?? null}
                  placeholder={t('import.auto')}
                  onPress={() => setPicking({ kind: 'column', field })}
                />
              ))}
            </>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <PickerField
          label={t('transactions.account')}
          value={accountNameById(accounts, accountId)}
          placeholder={t('transactions.form.chooseAccount')}
          onPress={() => setPicking({ kind: 'account' })}
        />
        {accounts.length === 0 ? (
          <Text variant="caption" tone="muted">
            {t('import.noAccounts')}
          </Text>
        ) : null}
        {isCsv ? (
          <SwitchField label={t('import.detectDuplicates')} hint={t('import.detectDuplicatesHint')} value={detectDuplicates} onChange={setDetectDuplicates} />
        ) : null}
      </Card>
      <SectionHeader title={t('import.review')} />
    </View>
  )

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={rows}
        keyExtractor={(_, index) => String(index)}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={styles.headerWrap}
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.description}, ${t('import.changeCategory')}`}
            onPress={() => setPicking({ kind: 'category', index })}
            style={[styles.item, { borderBottomColor: colors.border, opacity: item.excluded ? 0.45 : 1 }]}
          >
            <View style={styles.itemText}>
              <Text numberOfLines={1}>{item.description}</Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {formatDate(item.date, dateLocale)} · {categoryLabel(item)}
              </Text>
            </View>
            <AmountText
              variant="label"
              value={item.type === 'debit' ? -Number(item.amount) : Number(item.amount)}
              currency={item.currency ?? undefined}
              tone={item.type === 'credit' ? 'income' : 'expense'}
            />
            <Switch
              accessibilityLabel={t('import.include', { description: item.description })}
              value={!item.excluded}
              onValueChange={(value) => setRows(rows.map((row, i) => (i === index ? { ...row, excluded: !value } : row)))}
              trackColor={{ true: colors.primary, false: colors.muted }}
            />
          </Pressable>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Button
              label={t('import.importCount', { count: included.length })}
              onPress={submit}
              loading={runImport.isPending}
              disabled={!accountId || included.length === 0 || loading}
            />
          </View>
        }
      />
      {loading ? (
        <View style={[StyleSheet.absoluteFill, styles.overlay]}>
          <Loading />
        </View>
      ) : null}

      <SelectSheet
        visible={picking?.kind === 'account'}
        title={t('transactions.account')}
        options={accountOptions(accounts)}
        selected={accountId}
        onSelect={(id) => {
          setAccountId(id)
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking?.kind === 'category'}
        title={t('transactions.category')}
        options={categories}
        selected={picking?.kind === 'category' ? (rows[picking.index]?.chosenCategoryId ?? rows[picking.index]?.suggested_category_id ?? null) : null}
        noneLabel={t('transactions.uncategorized')}
        onSelect={(id) => {
          if (picking?.kind === 'category') {
            const index = picking.index
            setRows(rows.map((row, i) => (i === index ? { ...row, chosenCategoryId: id } : row)))
          }
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking?.kind === 'column'}
        title={t('import.columns')}
        options={columnOptions}
        selected={null}
        noneLabel={t('import.auto')}
        onSelect={(column) => {
          if (picking?.kind !== 'column') return
          const { field } = picking
          setPicking(null)
          if (field === 'inflow') applyOptions({ ...options, inflowColumn: column })
          else if (field === 'outflow') applyOptions({ ...options, outflowColumn: column })
          else applyOptions({ ...options, columnMapping: { ...options.columnMapping, [field]: column ?? undefined } })
        }}
        onClose={() => setPicking(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { gap: spacing.md },
  headerWrap: { padding: spacing.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemText: { flex: 1, gap: 2 },
  footer: { padding: spacing.lg, paddingBottom: spacing.xxl },
  overlay: { backgroundColor: 'rgba(0,0,0,0.15)' },
})
