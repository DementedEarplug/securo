import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Button } from '@/components/Button'
import { DateField } from '@/components/DateField'
import { PickerField } from '@/components/PickerField'
import { Screen } from '@/components/Screen'
import { SectionHeader } from '@/components/SectionHeader'
import { SelectSheet } from '@/components/SelectSheet'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useCurrencies } from '@/features/accounts/hooks'
import { useCreateInvoice, useInvoice, useInvoiceSettings, useUpdateInvoice } from '@/features/invoices/hooks'
import { InstallmentsEditor } from '@/features/invoices/InstallmentsEditor'
import { LinesEditor } from '@/features/invoices/LinesEditor'
import {
  customFieldDefs,
  emptyInvoiceValues,
  formTotal,
  invoiceErrorMessage,
  invoiceValuesFrom,
  linesTotal,
  toInvoiceCreate,
  toInvoiceUpdate,
  validateInvoiceForm,
  type Invoice,
  type InvoiceDirection,
  type InvoiceFormValues,
  type InvoiceSettings,
} from '@/features/invoices/model'
import { usePayees } from '@/features/payees/hooks'
import { useDisplayFormat } from '@/features/session/hooks'
import { toIsoDate } from '@/lib/dates'
import { formatAmountInput } from '@/lib/format'
import { spacing } from '@/theme'

/** A new invoice (`?direction=`), or a draft being edited (`?id=`). */
export default function InvoiceFormScreen() {
  const { id, direction } = useLocalSearchParams<{ id?: string; direction?: string }>()
  const invoice = useInvoice(id ?? '')
  const settings = useInvoiceSettings()
  if ((id && invoice.isPending) || settings.isPending) return <Loading />
  if (id && invoice.isError) return <ErrorState error={invoice.error} onRetry={() => invoice.refetch()} />
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
  return (
    <InvoiceForm
      invoice={id ? invoice.data : undefined}
      settings={settings.data}
      direction={direction === 'payable' ? 'payable' : 'receivable'}
    />
  )
}

function InvoiceForm({ invoice, settings, direction: newDirection }: { invoice?: Invoice; settings: InvoiceSettings; direction: InvoiceDirection }) {
  const { t } = useTranslation()
  const { locale, currency } = useDisplayFormat()
  const payees = usePayees().data ?? []
  const currencies = useCurrencies().data ?? []
  const create = useCreateInvoice()
  const update = useUpdateInvoice(invoice?.id ?? '')
  const direction = invoice?.direction ?? newDirection
  const payable = direction === 'payable'
  const showTax = settings.tax_fields !== 'hidden'
  const defs = customFieldDefs(settings.template)
  const [v, setV] = useState<InvoiceFormValues>(() =>
    invoice ? invoiceValuesFrom(invoice, locale) : emptyInvoiceValues(currency, { withLine: settings.document_required }),
  )
  const [picking, setPicking] = useState<'payee' | 'currency' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<'draft' | 'final' | null>(null)
  const set = (patch: Partial<InvoiceFormValues>) => setV((current) => ({ ...current, ...patch }))

  const submit = async (asDraft: boolean) => {
    const problem = validateInvoiceForm(v, locale, { linesRequired: settings.document_required, asDraft })
    if (problem) return setError(t(problem))
    setError(null)
    setSaving(asDraft ? 'draft' : 'final')
    try {
      if (invoice) {
        await update.mutateAsync(toInvoiceUpdate(v, locale, { hadLines: (invoice.lines ?? []).length > 0, showTax }))
        router.back()
      } else {
        const created = await create.mutateAsync(toInvoiceCreate(v, locale, { direction, asDraft, showTax }))
        router.replace({ pathname: '/invoices/[id]', params: { id: created.id } })
      }
    } catch (e) {
      setError(invoiceErrorMessage(e, t))
    } finally {
      setSaving(null)
    }
  }

  const termsDate = () => toIsoDate(new Date(Date.now() + settings.default_payment_terms_days * 86_400_000))
  const payeeName = payees.find((p) => p.id === v.payeeId)?.name ?? invoice?.payee?.name ?? null

  return (
    <Screen>
      <Stack.Screen
        options={{ title: invoice ? t('invoices.editDraft') : payable ? t('invoices.newPayable') : t('invoices.new') }}
      />
      {invoice ? (
        <Text variant="caption" tone="muted">
          {t('invoices.editDraftDescription')}
        </Text>
      ) : null}

      <PickerField
        label={payable ? t('invoices.field.supplier') : t('invoices.field.client')}
        value={payeeName}
        placeholder={payable ? t('invoices.field.supplierPlaceholder') : t('invoices.field.clientPlaceholder')}
        onPress={() => setPicking('payee')}
      />

      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label={t('invoices.field.total')}
            value={v.lines.length ? formatAmountInput(linesTotal(v.lines, locale), locale) : v.total}
            onChangeText={(total) => set({ total })}
            // Derived once there are lines, so the two can never disagree.
            editable={v.lines.length === 0}
            keyboardType="decimal-pad"
            placeholder="0"
          />
        </View>
        <View style={styles.currency}>
          <PickerField label={t('invoices.form.currency')} value={v.currency} placeholder="" onPress={() => setPicking('currency')} />
        </View>
      </View>

      {v.installments ? (
        <Text variant="caption" tone="muted">
          {t('invoices.installments.dueDerived')}
        </Text>
      ) : (
        <>
          {v.dueDate ? (
            <View style={styles.row}>
              <View style={styles.flex}>
                <DateField label={t('invoices.field.dueDate')} value={v.dueDate} onChange={(dueDate) => set({ dueDate })} />
              </View>
              {invoice ? null : <Button label={t('invoices.form.useTerms')} variant="ghost" onPress={() => set({ dueDate: null })} />}
            </View>
          ) : (
            <PickerField
              label={t('invoices.field.dueDate')}
              value={null}
              placeholder={t('invoices.form.termsDefault', { days: settings.default_payment_terms_days })}
              onPress={() => set({ dueDate: termsDate() })}
            />
          )}
          <Text variant="caption" tone="muted">
            {payable ? t('invoices.field.dueDateHintPayable') : t('invoices.field.dueDateHint', { days: settings.default_payment_terms_days })}
          </Text>
        </>
      )}

      {defs.length ? <SectionHeader title={t('invoices.form.custom')} /> : null}
      {defs.map((def) => (
        <TextField
          key={def.key}
          label={def.label}
          value={v.custom[def.key] ?? ''}
          onChangeText={(text) => set({ custom: { ...v.custom, [def.key]: text } })}
        />
      ))}

      <SectionHeader title={t('invoices.field.lines')} />
      {v.lines.length === 0 ? (
        <Text variant="caption" tone="muted">
          {t('invoices.field.linesOptional')}
        </Text>
      ) : null}
      <LinesEditor
        lines={v.lines}
        onChange={(lines) => set({ lines })}
        currency={v.currency}
        locale={locale}
        showTax={showTax}
        required={settings.document_required}
      />

      <InstallmentsEditor
        value={v.installments}
        onChange={(installments) => set({ installments })}
        total={formTotal(v, locale)}
        currency={v.currency}
        locale={locale}
        firstDueDate={v.dueDate ?? termsDate()}
      />

      <TextField
        label={t('invoices.field.notes')}
        value={v.notes}
        onChangeText={(notes) => set({ notes })}
        multiline
        style={styles.notes}
      />

      {error ? <Text tone="destructive">{error}</Text> : null}
      {invoice ? (
        <Button label={t('common.save')} onPress={() => submit(true)} loading={saving !== null} />
      ) : (
        <>
          <Button label={t('invoices.form.create')} onPress={() => submit(false)} loading={saving === 'final'} disabled={saving === 'draft'} />
          <Button
            label={t('invoices.action.saveDraft')}
            variant="secondary"
            onPress={() => submit(true)}
            loading={saving === 'draft'}
            disabled={saving === 'final'}
          />
        </>
      )}

      <SelectSheet
        visible={picking === 'payee'}
        title={payable ? t('invoices.field.supplier') : t('invoices.field.client')}
        options={payees.map((p) => ({ value: p.id, label: p.name }))}
        noneLabel={payable ? t('invoices.noSupplier') : t('invoices.noClient')}
        selected={v.payeeId}
        onSelect={(payeeId) => {
          set({ payeeId })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
      <SelectSheet
        visible={picking === 'currency'}
        title={t('invoices.form.currency')}
        options={currencies.map((c) => ({ value: c.code, label: `${c.flag ?? ''} ${c.code}`.trim(), detail: c.name }))}
        selected={v.currency}
        onSelect={(code) => {
          if (code) set({ currency: code })
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  flex: { flex: 1 },
  currency: { width: 120 },
  notes: { minHeight: 72, paddingTop: spacing.md, textAlignVertical: 'top' },
})
