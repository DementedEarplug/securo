import * as Clipboard from 'expo-clipboard'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share, StyleSheet, ToastAndroid, View } from 'react-native'

import { AmountText } from '@/components/AmountText'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import {
  downloadInvoicePdf,
  useDeleteInvoice,
  useInvoice,
  useInvoiceAction,
  useInvoiceSettings,
  useRemoveAllocation,
  useRemoveDeduction,
  useShareInvoice,
  useUnlinkSchedule,
  type InvoiceAction,
} from '@/features/invoices/hooks'
import {
  availableActions,
  canEditNotes,
  canMakeRecurring,
  displayNumber,
  invoiceErrorMessage,
  shareUrl,
  type Invoice,
} from '@/features/invoices/model'
import { StateBadge } from '@/features/invoices/StateBadge'
import { useCanWrite, useDisplayFormat, useSession } from '@/features/session/hooks'
import { confirmDestructive, showError } from '@/lib/confirm'
import { formatDate } from '@/lib/dates'
import { shareFile } from '@/lib/download'
import { formatCurrency } from '@/lib/format'
import { spacing } from '@/theme'

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const invoice = useInvoice(id)
  if (invoice.isPending) return <Loading />
  if (invoice.isError) return <ErrorState error={invoice.error} onRetry={() => invoice.refetch()} />
  return <InvoiceDetail invoice={invoice.data} refreshing={invoice.isRefetching} onRefresh={() => invoice.refetch()} />
}

function InvoiceDetail({ invoice, refreshing, onRefresh }: { invoice: Invoice; refreshing: boolean; onRefresh: () => void }) {
  const { t } = useTranslation()
  const { dateLocale, locale } = useDisplayFormat()
  const { serverUrl } = useSession()
  const canWrite = useCanWrite()
  const settings = useInvoiceSettings().data
  const action = useInvoiceAction(invoice.id)
  const remove = useDeleteInvoice()
  const unlink = useRemoveAllocation(invoice.id)
  const undeduct = useRemoveDeduction(invoice.id)
  const share = useShareInvoice(invoice.id)
  const unlinkSchedule = useUnlinkSchedule(invoice.id)
  const [downloading, setDownloading] = useState<'pdf' | 'statement' | null>(null)

  const actions = availableActions(invoice)
  const payable = invoice.direction === 'payable'
  const number = displayNumber(invoice, settings?.number_prefix)
  const money = (value: string | number | null | undefined) => formatCurrency(Number(value ?? 0), invoice.currency, locale)
  const date = (value: string | null | undefined) => (value ? formatDate(value, dateLocale) : '—')
  const lines = invoice.lines ?? []
  const allocations = invoice.allocations ?? []
  const deductions = invoice.deductions ?? []
  const installments = invoice.installments ?? []
  const link = invoice.share_token && serverUrl ? shareUrl(serverUrl, invoice.share_token) : null

  const run = async (kind: InvoiceAction) => {
    const prompts: Record<InvoiceAction, [string, string, string] | null> = {
      issue: [t('invoices.confirm.issueTitle'), t('invoices.confirm.issueBody'), t('invoices.action.issue')],
      void: [t('invoices.confirm.voidTitle'), t('invoices.confirm.voidBody'), t('invoices.action.void')],
      uncollectible: [t('invoices.confirm.writeOffTitle'), t('invoices.confirm.writeOffBody'), t('invoices.action.writeOff')],
      reopen: null,
    }
    const prompt = prompts[kind]
    if (prompt && !(await confirmDestructive(...prompt))) return
    try {
      await action.mutateAsync(kind)
    } catch (e) {
      showError(invoiceErrorMessage(e, t))
    }
  }

  const confirmDelete = async () => {
    if (!(await confirmDestructive(t('invoices.confirm.deleteTitle'), t('invoices.confirm.deleteBody')))) return
    try {
      await remove.mutateAsync(invoice.id)
      router.back()
    } catch (e) {
      showError(invoiceErrorMessage(e, t))
    }
  }

  const confirmUnlink = async (allocationId: string) => {
    if (!(await confirmDestructive(t('invoices.confirm.unlinkTitle'), t('invoices.confirm.unlinkBody'), t('invoices.action.unlink')))) return
    try {
      await unlink.mutateAsync(allocationId)
    } catch (e) {
      showError(invoiceErrorMessage(e, t))
    }
  }

  const confirmUndeduct = async (deductionId: string) => {
    if (!(await confirmDestructive(t('invoices.confirm.removeDeductionTitle'), t('invoices.confirm.removeDeductionBody')))) return
    try {
      await undeduct.mutateAsync(deductionId)
    } catch (e) {
      showError(invoiceErrorMessage(e, t))
    }
  }

  const download = async (kind: 'pdf' | 'statement') => {
    setDownloading(kind)
    try {
      const { file, mimeType } = await downloadInvoicePdf(invoice, number, kind)
      await shareFile(file, mimeType ?? 'application/pdf', number ?? t('invoices.noNumber'))
    } catch (e) {
      showError(invoiceErrorMessage(e, t))
    } finally {
      setDownloading(null)
    }
  }

  const toggleShare = async () => {
    try {
      if (link) {
        if (!(await confirmDestructive(t('invoices.share.revokeTitle'), t('invoices.share.revokeBody'), t('invoices.share.revoke')))) return
        await share.mutateAsync(false)
      } else {
        const created = await share.mutateAsync(true)
        if (created && serverUrl) await Share.share({ message: shareUrl(serverUrl, created.token) })
      }
    } catch (e) {
      showError(invoiceErrorMessage(e, t))
    }
  }

  const confirmUnlinkSchedule = async () => {
    if (
      !(await confirmDestructive(
        t('invoices.schedules.confirm.unlinkTitle'),
        t('invoices.schedules.confirm.unlinkBody'),
        t('invoices.schedules.action.unlink'),
      ))
    )
      return
    try {
      await unlinkSchedule.mutateAsync()
    } catch (e) {
      showError(invoiceErrorMessage(e, t))
    }
  }

  const copyLink = async () => {
    if (!link) return
    await Clipboard.setStringAsync(link)
    ToastAndroid.show(t('invoices.share.copied'), ToastAndroid.SHORT)
  }

  const fact = (label: string, value: string, tone?: 'income' | 'expense' | 'muted') => (
    <View style={styles.fact}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="label" tone={tone ?? 'default'}>
        {value}
      </Text>
    </View>
  )

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Stack.Screen
        options={{
          title: number ?? t('invoices.noNumber'),
        }}
      />

      <Card>
        <View style={styles.headline}>
          <Text variant="heading" style={styles.flex} numberOfLines={2}>
            {invoice.payee?.name ?? (payable ? t('invoices.noSupplier') : t('invoices.noClient'))}
          </Text>
          <StateBadge state={invoice.state} />
        </View>
        <AmountText variant="title" value={Number(invoice.total)} currency={invoice.currency} />
        {invoice.days_overdue ? (
          <Text variant="caption" tone="expense">
            {t('invoices.daysLate', { count: invoice.days_overdue })}
          </Text>
        ) : null}
        <View style={styles.facts}>
          {fact(t('invoices.issueDate'), date(invoice.issue_date))}
          {fact(
            installments.length ? t('invoices.installments.nextDue') : t('invoices.dueDate'),
            date(invoice.next_due_date ?? invoice.due_date),
          )}
          {fact(payable ? t('invoices.paidOut') : t('invoices.paid'), money(invoice.amount_paid), Number(invoice.amount_paid) > 0 ? 'income' : undefined)}
          {Number(invoice.amount_deducted) > 0 ? fact(t('invoices.deducted'), money(invoice.amount_deducted)) : null}
          {fact(t('invoices.balance'), money(invoice.balance), Number(invoice.balance) > 0 && invoice.state === 'overdue' ? 'expense' : undefined)}
        </View>
      </Card>

      {invoice.schedule ? (
        <Card style={styles.list}>
          <ListRow
            title={t('invoices.schedules.partOf', { name: invoice.schedule.name })}
            subtitle={t(`invoices.schedules.frequency.${invoice.schedule.frequency}`, { defaultValue: invoice.schedule.frequency })}
            onPress={() => router.push({ pathname: '/invoices/schedules/[id]', params: { id: invoice.schedule!.id } })}
            showChevron
          />
        </Card>
      ) : null}

      {link ? (
        <Card>
          <Text variant="label">{t('invoices.share.title')}</Text>
          <Text variant="caption" tone="muted">
            {t('invoices.share.active')}
          </Text>
          <Text variant="caption" selectable numberOfLines={2}>
            {link}
          </Text>
          <View style={styles.buttons}>
            <View style={styles.flex}>
              <Button label={t('invoices.share.send')} variant="secondary" onPress={() => void Share.share({ message: link })} />
            </View>
            <View style={styles.flex}>
              <Button label={t('invoices.share.copy')} variant="secondary" onPress={copyLink} />
            </View>
          </View>
        </Card>
      ) : null}

      {canWrite ? (
        <View style={styles.actions}>
          {actions.canIssue ? <Button label={t('invoices.action.issue')} onPress={() => run('issue')} loading={action.isPending} /> : null}
          {actions.canEdit ? (
            <Button
              label={t('invoices.editDraft')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/invoices/form', params: { id: invoice.id } })}
            />
          ) : null}
          {actions.canAllocate ? (
            <Button
              label={t('invoices.pay.title')}
              onPress={() => router.push({ pathname: '/invoices/pay', params: { id: invoice.id } })}
            />
          ) : null}
          {actions.canAllocate ? (
            <Button
              label={t('invoices.deductions.action')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/invoices/deduct', params: { id: invoice.id } })}
            />
          ) : null}
          {actions.canShare ? (
            <Button
              label={link ? t('invoices.share.revoke') : t('invoices.share.create')}
              variant={link ? 'ghost' : 'secondary'}
              onPress={toggleShare}
              loading={share.isPending}
            />
          ) : null}
          {actions.canReopen ? <Button label={t('invoices.action.reopen')} variant="secondary" onPress={() => run('reopen')} /> : null}
          {canEditNotes(invoice) ? (
            <Button
              label={t('invoices.notesEdit.action')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/invoices/notes', params: { id: invoice.id } })}
            />
          ) : null}
          {canMakeRecurring(invoice) ? (
            <Button
              label={t('invoices.schedules.action.makeRecurring')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/invoices/schedules/form', params: { invoiceId: invoice.id } })}
            />
          ) : null}
          {invoice.schedule_id ? (
            <Button
              label={t('invoices.schedules.action.unlink')}
              variant="ghost"
              onPress={confirmUnlinkSchedule}
              loading={unlinkSchedule.isPending}
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button label={t('invoices.action.downloadPdf')} variant="secondary" onPress={() => download('pdf')} loading={downloading === 'pdf'} />
        {actions.canStatement ? (
          <Button
            label={t('invoices.action.downloadStatement')}
            variant="secondary"
            onPress={() => download('statement')}
            loading={downloading === 'statement'}
          />
        ) : null}
      </View>

      <SectionHeader title={t('invoices.lines')} />
      <Card style={styles.list}>
        {lines.length === 0 ? (
          <ListRow title={t('invoices.noLinesHint')} />
        ) : (
          lines.map((line) => (
            <ListRow
              key={line.id}
              title={line.description}
              subtitle={[
                `${Number(line.quantity)}${line.unit ? ` ${line.unit}` : ''} × ${money(line.unit_price)}`,
                line.tax_rate != null ? `${t('invoices.field.taxRate')} ${Number(line.tax_rate)}%` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              trailing={<Text variant="label">{money(line.total)}</Text>}
            />
          ))
        )}
        {Number(invoice.discount) > 0 || Number(invoice.tax_total) > 0 ? (
          <View style={styles.totals}>
            {fact(t('invoices.subtotal'), money(invoice.subtotal))}
            {Number(invoice.discount) > 0 ? fact(t('invoices.discount'), `−${money(invoice.discount)}`) : null}
            {Number(invoice.tax_total) > 0 ? fact(t('invoices.tax'), money(invoice.tax_total)) : null}
          </View>
        ) : null}
      </Card>

      {installments.length ? (
        <>
          <SectionHeader title={t('invoices.installments.schedule')} />
          <Card style={styles.list}>
            {installments.map((row) => (
              <ListRow
                key={row.id}
                title={row.label || t('invoices.installments.labelPlaceholder', { n: row.position + 1, total: installments.length })}
                subtitle={`${date(row.due_date)} · ${t(`invoices.installments.state.${row.state ?? 'open'}`, { defaultValue: row.state ?? '' })}`}
                trailing={<Text variant="label">{money(row.amount)}</Text>}
              />
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title={t('invoices.payments')} />
      <Card style={styles.list}>
        {allocations.length === 0 ? (
          <ListRow title={t('invoices.noPayments')} />
        ) : (
          allocations.map((allocation) => (
            <ListRow
              key={allocation.id}
              title={allocation.transaction?.description ?? t('invoices.linkedPayment')}
              subtitle={[
                allocation.transaction?.date ? date(allocation.transaction.date) : null,
                allocation.method === 'manual' ? t('invoices.linkedManually') : t('invoices.linkedAutomatically'),
              ]
                .filter(Boolean)
                .join(' · ')}
              onPress={canWrite ? () => void confirmUnlink(allocation.id) : undefined}
              trailing={<Text variant="label" tone="income">{money(allocation.amount)}</Text>}
            />
          ))
        )}
      </Card>

      {deductions.length ? (
        <>
          <SectionHeader title={t('invoices.deductionsTitle')} />
          <Card style={styles.list}>
            {deductions.map((deduction) => (
              <ListRow
                key={deduction.id}
                title={t(`invoices.deductions.kind.${deduction.kind}`)}
                subtitle={[deduction.tax_kind, deduction.note].filter(Boolean).join(' · ') || null}
                onPress={canWrite && invoice.status === 'open' ? () => void confirmUndeduct(deduction.id) : undefined}
                trailing={<Text variant="label">{money(deduction.amount)}</Text>}
              />
            ))}
          </Card>
        </>
      ) : null}

      {invoice.notes ? (
        <>
          <SectionHeader title={t('invoices.notes')} />
          <Card>
            <Text>{invoice.notes}</Text>
          </Card>
        </>
      ) : null}
      {invoice.internal_notes ? (
        <>
          <SectionHeader title={t('invoices.notesEdit.internal')} />
          <Card>
            <Text>{invoice.internal_notes}</Text>
          </Card>
        </>
      ) : null}

      {canWrite && (actions.canVoid || actions.canWriteOff || actions.canDelete) ? (
        <View style={styles.actions}>
          {actions.canWriteOff ? <Button label={t('invoices.action.writeOff')} variant="ghost" onPress={() => run('uncollectible')} /> : null}
          {actions.canVoid ? <Button label={t('invoices.action.void')} variant="destructive" onPress={() => run('void')} /> : null}
          {actions.canDelete ? (
            <Button label={t('common.delete')} variant="destructive" onPress={confirmDelete} loading={remove.isPending} />
          ) : null}
        </View>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headline: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  facts: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md, marginTop: spacing.md },
  fact: { width: '50%', gap: 2 },
  totals: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm, padding: spacing.lg },
  list: { padding: 0, overflow: 'hidden' },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actions: { gap: spacing.sm },
})
