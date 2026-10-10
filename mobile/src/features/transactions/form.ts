import { z } from 'zod'

import type { Transaction, TransactionCreate, TransactionUpdate } from '@/api/types'
import { toIsoDate } from '@/lib/dates'
import { formatAmountInput, parseAmountInput } from '@/lib/format'

export interface TransactionFormValues {
  description: string
  /** As typed, in the display locale's separators (e.g. "1.234,56"). */
  amount: string
  type: 'debit' | 'credit'
  date: string
  accountId: string
  categoryId: string | null
  payeeId: string | null
  notes: string
}

/** Validation messages are i18n keys; the form translates them. */
export function transactionFormSchema(locale: string) {
  return z.object({
    description: z.string().trim().min(1, 'transactions.form.descriptionRequired').max(500),
    amount: z.string().refine((value) => {
      const parsed = parseAmountInput(value, locale)
      return parsed !== null && parsed > 0
    }, 'transactions.form.amountInvalid'),
    type: z.enum(['debit', 'credit']),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    accountId: z.string().min(1, 'transactions.form.accountRequired'),
    categoryId: z.string().nullable(),
    payeeId: z.string().nullable(),
    notes: z.string().max(1000, 'transactions.form.notesTooLong'),
  })
}

export function emptyFormValues(accountId = '', today = new Date()): TransactionFormValues {
  return { description: '', amount: '', type: 'debit', date: toIsoDate(today), accountId, categoryId: null, payeeId: null, notes: '' }
}

export function formValuesFrom(tx: Transaction, locale: string): TransactionFormValues {
  return {
    description: tx.description,
    amount: formatAmountInput(Math.abs(Number(tx.amount)), locale),
    type: tx.type === 'credit' ? 'credit' : 'debit',
    date: tx.date,
    accountId: tx.account_id ?? '',
    categoryId: tx.category_id ?? null,
    payeeId: tx.payee_id ?? null,
    notes: tx.notes ?? '',
  }
}

function amountString(value: string, locale: string): string {
  // Validated before this runs; the API takes a decimal string.
  return String(parseAmountInput(value, locale) ?? 0)
}

export function toCreatePayload(values: TransactionFormValues, locale: string): TransactionCreate {
  return {
    description: values.description.trim(),
    amount: amountString(values.amount, locale),
    type: values.type,
    date: values.date,
    account_id: values.accountId,
    category_id: values.categoryId,
    payee_id: values.payeeId,
    notes: values.notes.trim() || null,
  }
}

export type LockableField = 'amount' | 'type' | 'date' | 'account'

/**
 * Fields that can't change from here because they tie a transaction to other
 * rows. A transfer leg's amount, date and text copy to the other leg on the
 * server, but it must stay a debit/credit pair across two accounts. (A split
 * stays editable: the edit screen resends its shares with a new amount.)
 */
export function lockedFields(tx: Transaction): Set<LockableField> {
  if (tx.transfer_pair_id) return new Set(['type', 'account'])
  return new Set()
}

/** Part of an installment plan: edits and deletes can apply to later installments too. */
export function isInstallmentSeries(tx: Transaction): boolean {
  return Boolean(tx.installment_series_id && (tx.total_installments ?? 0) > 1)
}

/** Only what changed, so the server never re-applies untouched fields. */
export function toUpdatePayload(
  values: TransactionFormValues,
  original: Transaction,
  locale: string,
): TransactionUpdate {
  const before = formValuesFrom(original, locale)
  const patch: TransactionUpdate = {}
  if (values.description.trim() !== before.description) patch.description = values.description.trim()
  if (values.categoryId !== before.categoryId) patch.category_id = values.categoryId
  if (values.payeeId !== before.payeeId) patch.payee_id = values.payeeId
  if (values.notes.trim() !== before.notes.trim()) patch.notes = values.notes.trim() || null

  const locked = lockedFields(original)
  const amount = amountString(values.amount, locale)
  if (!locked.has('amount') && Number(amount) !== Math.abs(Number(original.amount))) patch.amount = amount
  if (!locked.has('type') && values.type !== before.type) patch.type = values.type
  if (!locked.has('date') && values.date !== before.date) patch.date = values.date
  if (!locked.has('account') && values.accountId !== before.accountId) patch.account_id = values.accountId
  return patch
}

/**
 * Whether changing a transaction's category should offer to recategorise the
 * vendor's other transactions: only when it moved to a category, and not for
 * transfers or transactions shared from someone else's split group.
 */
export function offersSimilar(tx: Pick<Transaction, 'transfer_pair_id' | 'is_shared'>, categoryId: string | null | undefined): categoryId is string {
  return Boolean(categoryId) && !tx.transfer_pair_id && !tx.is_shared
}
