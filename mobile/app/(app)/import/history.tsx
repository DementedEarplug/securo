import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { EmptyState, ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { useImportLogs, useUndoImport, type ImportLog } from '@/features/import/api'
import { useCanWrite, useDisplayFormat } from '@/features/session/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { formatDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatCurrency } from '@/lib/format'

export default function ImportHistoryScreen() {
  const { t } = useTranslation()
  const { dateLocale, locale } = useDisplayFormat()
  const canWrite = useCanWrite()
  const logs = useImportLogs()
  const undo = useUndoImport()

  if (logs.isPending) return <Loading />
  if (logs.isError) return <ErrorState error={logs.error} onRetry={() => logs.refetch()} />

  const confirmUndo = async (log: ImportLog) => {
    const ok = await confirmDestructive(
      t('import.undoTitle'),
      t('import.undoBody', { count: log.transaction_count, file: log.filename }),
      t('import.undo'),
    )
    if (!ok) return
    try {
      await undo.mutateAsync(log.id)
    } catch (e) {
      showError(errorMessage(e, t))
    }
  }

  return (
    <Screen onRefresh={() => logs.refetch()} refreshing={logs.isRefetching}>
      {logs.data.length === 0 ? (
        <EmptyState title={t('import.historyEmpty')} />
      ) : (
        <>
          {canWrite ? <Text tone="muted">{t('import.historyIntro')}</Text> : null}
          <Card style={styles.list}>
            {logs.data.map((log) => {
              const currency = log.account_currency ?? undefined
              return (
                <ListRow
                  key={log.id}
                  title={log.filename || log.format.toUpperCase()}
                  subtitle={[
                    formatDate(log.created_at.slice(0, 10), dateLocale),
                    log.account_name,
                    t('import.historyCount', { count: log.transaction_count }),
                    `+${formatCurrency(Number(log.total_credit), currency, locale)} / −${formatCurrency(Number(log.total_debit), currency, locale)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  onPress={canWrite ? () => void confirmUndo(log) : undefined}
                  trailing={canWrite ? <Text tone="destructive" variant="label">{t('import.undo')}</Text> : null}
                />
              )
            })}
          </Card>
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden' },
})
