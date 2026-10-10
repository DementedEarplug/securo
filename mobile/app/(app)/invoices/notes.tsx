import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { Button } from '@/components/Button'
import { Screen } from '@/components/Screen'
import { ErrorState, Loading } from '@/components/States'
import { Text } from '@/components/Text'
import { TextField } from '@/components/TextField'
import { useInvoice, useUpdateInvoiceNotes } from '@/features/invoices/hooks'
import { invoiceErrorMessage, type Invoice } from '@/features/invoices/model'
import { spacing } from '@/theme'

/** Notes stay editable after issue: they are the seller's own record. */
export default function InvoiceNotesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const invoice = useInvoice(id)
  if (invoice.isPending) return <Loading />
  if (invoice.isError) return <ErrorState error={invoice.error} onRetry={() => invoice.refetch()} />
  return <NotesForm invoice={invoice.data} />
}

function NotesForm({ invoice }: { invoice: Invoice }) {
  const { t } = useTranslation()
  const save = useUpdateInvoiceNotes(invoice.id)
  const [notes, setNotes] = useState(invoice.notes ?? '')
  const [internal, setInternal] = useState(invoice.internal_notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    try {
      await save.mutateAsync({ notes: notes.trim() || null, internal_notes: internal.trim() || null })
      router.back()
    } catch (e) {
      setError(invoiceErrorMessage(e, t))
    }
  }

  return (
    <Screen>
      <TextField label={t('invoices.notesEdit.public')} value={notes} onChangeText={setNotes} multiline style={styles.multiline} />
      <TextField label={t('invoices.notesEdit.internal')} value={internal} onChangeText={setInternal} multiline style={styles.multiline} />
      <Text variant="caption" tone="muted">
        {t('invoices.notesEdit.internalHint')}
      </Text>
      {error ? <Text tone="destructive">{error}</Text> : null}
      <Button label={t('common.save')} onPress={submit} loading={save.isPending} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  multiline: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
})
