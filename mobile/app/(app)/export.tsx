import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { DateField } from '@/components/DateField'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SelectSheet } from '@/components/SelectSheet'
import { SwitchField } from '@/components/SwitchField'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { accountOptions, useAccounts } from '@/features/accounts/hooks'
import {
  backupBody,
  checkBackupPassword,
  csvExportPath,
  EXPORT_PERIODS,
  MIN_BACKUP_PASSWORD,
  periodRange,
  type ExportPeriod,
} from '@/features/data/export'
import { useCurrentWorkspace } from '@/features/session/hooks'
import { showError } from '@/lib/confirm'
import { toIsoDate } from '@/lib/dates'
import { downloadToCache, shareFile } from '@/lib/download'
import { errorMessage } from '@/lib/errors'
import { spacing } from '@/theme'

/**
 * Take data out of Securo: transactions as CSV, the categorization rules as
 * JSON, and the whole workspace as a (optionally encrypted) zip. Files go to
 * Android's share sheet, so they can be saved to Files, Drive, email, …
 */
export default function ExportScreen() {
  const { t } = useTranslation()
  const workspace = useCurrentWorkspace()

  return (
    <Screen>
      {workspace ? (
        <Text variant="caption" tone="muted">
          {t('data.workspaceNotice', { name: workspace.name })}
        </Text>
      ) : null}
      <TransactionsExport />
      <RulesExport />
      <BackupCard />
    </Screen>
  )
}

function TransactionsExport() {
  const { t } = useTranslation()
  const accounts = useAccounts({ includeClosed: true }).data ?? []
  const today = toIsoDate(new Date())
  const [period, setPeriod] = useState<ExportPeriod>('all')
  const [custom, setCustom] = useState({ from: today.slice(0, 8) + '01', to: today })
  const [accountIds, setAccountIds] = useState<string[]>([])
  const [excludeIgnored, setExcludeIgnored] = useState(false)
  const [picking, setPicking] = useState<'period' | 'accounts' | null>(null)
  const [busy, setBusy] = useState(false)

  const accountsLabel =
    accountIds.length === 0
      ? t('data.csv.allAccounts')
      : accountIds.length === 1
        ? (accountOptions(accounts).find((o) => o.value === accountIds[0])?.label ?? t('data.csv.accountCount', { count: 1 }))
        : t('data.csv.accountCount', { count: accountIds.length })

  const run = async () => {
    setBusy(true)
    try {
      const range = periodRange(period, new Date(), custom)
      const path = csvExportPath({ ...range, accountIds, excludeIgnored })
      const { file, mimeType } = await downloadToCache(path, `transactions-${today}.csv`)
      await shareFile(file, mimeType ?? 'text/csv', t('data.csv.title'))
    } catch (e) {
      showError(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <Text variant="heading">{t('data.csv.title')}</Text>
      <Text tone="muted">{t('data.csv.description')}</Text>
      <PickerField
        label={t('data.csv.period')}
        value={t(`data.periods.${period}`)}
        placeholder={t('data.csv.period')}
        onPress={() => setPicking('period')}
      />
      {period === 'custom' ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <DateField label={t('data.csv.from')} value={custom.from} onChange={(from) => setCustom((c) => ({ ...c, from }))} />
          </View>
          <View style={styles.flex}>
            <DateField label={t('data.csv.to')} value={custom.to} onChange={(to) => setCustom((c) => ({ ...c, to }))} />
          </View>
        </View>
      ) : null}
      <PickerField label={t('data.csv.accounts')} value={accountsLabel} placeholder={t('data.csv.allAccounts')} onPress={() => setPicking('accounts')} />
      <SwitchField label={t('data.csv.excludeIgnored')} hint={t('data.csv.excludeIgnoredHint')} value={excludeIgnored} onChange={setExcludeIgnored} />
      <Button label={t('data.csv.button')} onPress={() => void run()} loading={busy} />

      <SelectSheet
        visible={picking === 'period'}
        title={t('data.csv.period')}
        options={EXPORT_PERIODS.map((value) => ({ value, label: t(`data.periods.${value}`) }))}
        selected={period}
        onSelect={(value) => {
          if (value) setPeriod(value as ExportPeriod)
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'accounts'}
        title={t('data.csv.accounts')}
        options={accountOptions(accounts)}
        selected={accountIds}
        noneLabel={t('data.csv.allAccounts')}
        onSelect={(value) => {
          if (value === null) setAccountIds([])
          else setAccountIds((ids) => (ids.includes(value) ? ids.filter((id) => id !== value) : [...ids, value]))
        }}
        onClose={() => setPicking(null)}
      />
    </Card>
  )
}

function RulesExport() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      const { file, mimeType } = await downloadToCache('/api/rules/export', `securo-categorization-rules-${toIsoDate(new Date())}.json`)
      await shareFile(file, mimeType ?? 'application/json', t('data.rules.title'))
    } catch (e) {
      showError(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <Text variant="heading">{t('data.rules.title')}</Text>
      <Text tone="muted">{t('data.rules.description')}</Text>
      <Button label={t('data.rules.button')} variant="secondary" onPress={() => void run()} loading={busy} />
    </Card>
  )
}

function BackupCard() {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<'plain' | 'encrypted' | null>(null)

  const run = async () => {
    setError(null)
    setDone(null)
    const problem = checkBackupPassword(password, confirmation)
    if (problem) {
      setError(t(problem, { min: MIN_BACKUP_PASSWORD }))
      return
    }
    setBusy(true)
    try {
      const { file, mimeType } = await downloadToCache('/api/export/backup', `securo-backup-${toIsoDate(new Date())}.zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: backupBody(password),
      })
      await shareFile(file, mimeType ?? 'application/zip', t('data.backup.title'))
      setDone(password ? 'encrypted' : 'plain')
      setPassword('')
      setConfirmation('')
    } catch (e) {
      showError(errorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <Text variant="heading">{t('data.backup.title')}</Text>
      <Text tone="muted">{t('data.backup.description')}</Text>
      <TextField
        label={t('data.backup.passwordLabel')}
        placeholder={t('data.backup.passwordPlaceholder')}
        value={password}
        onChangeText={(value) => {
          setPassword(value)
          setError(null)
        }}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
      />
      {password ? (
        <>
          <TextField
            label={t('data.backup.confirmLabel')}
            value={confirmation}
            onChangeText={(value) => {
              setConfirmation(value)
              setError(null)
            }}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
          />
          <Text variant="caption" tone="muted">
            {t('data.backup.encryptionNote')}
          </Text>
        </>
      ) : null}
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('data.backup.button')} onPress={() => void run()} loading={busy} />
      {done ? (
        <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
          {done === 'encrypted' ? t('data.backup.successEncrypted') : t('data.backup.success')}
        </Text>
      ) : null}
      <Text variant="caption" tone="muted">
        {t('data.backup.restoreNote')}
      </Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
})
