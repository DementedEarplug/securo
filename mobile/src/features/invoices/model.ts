import type { TFunction } from 'i18next'

import { ApiError } from '@/api/errors'
import type { components } from '@/api/schema'
import type { Transaction } from '@/api/types'
import { errorMessage } from '@/lib/errors'
import { formatAmountInput, parseAmountInput } from '@/lib/format'

type Schemas = components['schemas']
export type Invoice = Schemas['InvoiceRead']
export type InvoiceSettings = Schemas['InvoiceSettingsRead']
export type InvoiceSummary = Schemas['InvoiceSummary']
export type InvoiceFacets = Schemas['InvoiceFacets']
export type InvoiceCreate = Schemas['InvoiceCreate']
export type InvoiceUpdate = Schemas['InvoiceUpdate']
export type InvoiceState = Invoice['state']
export type InvoiceDirection = Invoice['direction']
export type DeductionKind = Schemas['DeductionCreate']['kind']

/** The filter bar, as on the web. `open` spans three derived states. */
export const FILTERS = ['all', 'open', 'overdue', 'paid', 'draft'] as const
export type InvoiceFilter = (typeof FILTERS)[number]

/** Derived states where money is still expected. `uncollectible` is a decision to stop expecting. */
export const OUTSTANDING_STATES: InvoiceState[] = ['open', 'partial', 'overdue']

export const DEDUCTION_KINDS: DeductionKind[] = ['withholding_tax', 'gateway_fee', 'fx_difference', 'other']

/** What the list asks the server for; `open` is filtered locally (see `applyFilter`). */
export function stateParam(filter: InvoiceFilter): string | undefined {
  return filter === 'all' || filter === 'open' ? undefined : filter
}

export function applyFilter(invoices: Invoice[], filter: InvoiceFilter): Invoice[] {
  return filter === 'open' ? invoices.filter((i) => OUTSTANDING_STATES.includes(i.state)) : invoices
}

/**
 * Which actions to offer. Mirrors the server's rules (and the web's
 * `availableActions`) so nobody is shown a button that can only fail;
 * the server still enforces each one.
 */
export function availableActions(invoice: Invoice) {
  const isDraft = invoice.status === 'draft'
  const isOpen = invoice.status === 'open'
  const ours = invoice.direction === 'receivable' && invoice.origin !== 'imported'
  return {
    canEdit: isDraft,
    canDelete: isDraft,
    canIssue: isDraft,
    // Voiding with money attached would strand the allocation.
    canVoid: isOpen && (invoice.allocations ?? []).length === 0,
    canWriteOff: isOpen,
    canReopen: invoice.status === 'uncollectible',
    canAllocate: isOpen && Number(invoice.balance) > 0,
    canShare: !isDraft && ours && invoice.status !== 'void',
    // The statement is for what we issued: a draft was sent to nobody.
    canStatement: !isDraft && ours,
  }
}

/**
 * The number as a person reads it. Drafts have none. An imported document
 * keeps the name its source gave it; ours uses the prefix frozen on issue,
 * falling back to the live setting only when nothing was frozen.
 */
export function displayNumber(invoice: Invoice, prefix?: string | null): string | null {
  if (invoice.origin === 'imported') return invoice.external_number || null
  if (invoice.number == null) return null
  const frozen = invoice.snapshot ? ((invoice.snapshot.number_prefix as string | null | undefined) ?? '') : null
  return `${frozen ?? prefix ?? ''}${invoice.number}`
}

/** The public page a share token opens; the server only knows the path. */
export function shareUrl(serverUrl: string, token: string): string {
  return `${serverUrl.replace(/\/+$/, '')}/i/${token}`
}

/** A sentence for an invoice rule violation (`detail.code`), else the generic mapping. */
export function invoiceErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError && error.code) {
    const key = `invoices.errors.${error.code}`
    const text = t(key, { defaultValue: '' })
    if (text) return text
  }
  return errorMessage(error, t)
}

/**
 * Money that can settle this invoice: moving the way it is settled (in for
 * a receivable, out for a payable — the type filter is the caller's query),
 * in its currency, not already linked to it, with something left to give.
 */
export function paymentCandidates(transactions: Transaction[], invoice: Pick<Invoice, 'id' | 'currency'>): Transaction[] {
  return transactions.filter((tx) => {
    if ((tx.currency ?? invoice.currency) !== invoice.currency) return false
    const links = tx.invoice_links ?? []
    if (links.some((link) => link.invoice_id === invoice.id)) return false
    const used = links.reduce((sum, link) => sum + Number(link.amount), 0)
    return Math.abs(Number(tx.amount)) - used > 0.005
  })
}

/** What one payment would leave unpaid of what it was meant to cover. */
export function paymentShortfall(target: number, balance: number, txAmount: number, typed: number | null): number {
  const applied = typed ?? Math.min(balance, Math.abs(txAmount))
  return Math.round((target - applied) * 100) / 100
}

// ---------------------------------------------------------------------------
// The draft form
// ---------------------------------------------------------------------------

export interface LineValues {
  description: string
  quantity: string
  unit: string
  unitPrice: string
  taxRate: string
}

export interface InstallmentValues {
  label: string
  dueDate: string
  amount: string
}

export interface InvoiceFormValues {
  payeeId: string | null
  currency: string
  /** Only used without line items; with lines the server computes the total. */
  total: string
  /** Null means "the workspace's payment terms". Ignored with installments. */
  dueDate: string | null
  notes: string
  lines: LineValues[]
  custom: Record<string, string>
  /** Null is the ordinary invoice with one due date; a list is a payment schedule. */
  installments: InstallmentValues[] | null
}

export function emptyLine(): LineValues {
  return { description: '', quantity: '1', unit: '', unitPrice: '', taxRate: '' }
}

export function emptyInvoiceValues(currency: string, { withLine = false } = {}): InvoiceFormValues {
  return {
    payeeId: null,
    currency,
    total: '',
    dueDate: null,
    notes: '',
    lines: withLine ? [emptyLine()] : [],
    custom: {},
    installments: null,
  }
}

export function lineValuesFrom(
  lines: { description: string; quantity?: number | string; unit?: string | null; unit_price?: number | string; tax_rate?: number | string | null }[],
  locale: string,
): LineValues[] {
  return lines.map((line) => ({
    description: line.description,
    quantity: formatAmountInput(Number(line.quantity ?? 1), locale, 4),
    unit: line.unit ?? '',
    unitPrice: formatAmountInput(Number(line.unit_price ?? 0), locale),
    taxRate: line.tax_rate == null ? '' : formatAmountInput(Number(line.tax_rate), locale),
  }))
}

export function invoiceValuesFrom(invoice: Invoice, locale: string): InvoiceFormValues {
  const custom: Record<string, string> = {}
  for (const [key, value] of Object.entries(invoice.custom_fields ?? {})) {
    if (value != null) custom[key] = String(value)
  }
  const installments = invoice.installments ?? []
  return {
    payeeId: invoice.payee_id ?? null,
    currency: invoice.currency,
    total: formatAmountInput(Number(invoice.total), locale),
    dueDate: invoice.due_date,
    notes: invoice.notes ?? '',
    lines: lineValuesFrom(invoice.lines ?? [], locale),
    custom,
    installments: installments.length
      ? installments.map((row) => ({
          label: row.label ?? '',
          dueDate: row.due_date,
          amount: formatAmountInput(Number(row.amount), locale),
        }))
      : null,
  }
}

/** One line's amount before tax, or null while it can't be read. */
export function lineTotal(line: LineValues, locale: string): number | null {
  const quantity = parseAmountInput(line.quantity, locale)
  const price = parseAmountInput(line.unitPrice, locale)
  if (quantity === null || price === null) return null
  return quantity * price
}

/** The running total the form shows while typing; the server's answer is the stored one. */
export function linesTotal(lines: LineValues[], locale: string): number {
  return lines.reduce((sum, line) => sum + (lineTotal(line, locale) ?? 0), 0)
}

/** What the invoice will be worth: its lines when it has any, else the typed amount. */
export function formTotal(values: Pick<InvoiceFormValues, 'lines' | 'total'>, locale: string): number {
  return values.lines.length ? linesTotal(values.lines, locale) : (parseAmountInput(values.total || '0', locale) ?? 0)
}

/** `YYYY-MM-DD` plus N calendar months, the day clamped to the target month. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const index = m - 1 + months
  const year = y + Math.floor(index / 12)
  const month = (((index % 12) + 12) % 12) + 1
  const day = Math.min(d, new Date(year, month, 0).getDate())
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** `count` equal installments a month apart from `first`; leftover cents land on the last. */
export function splitEvenly(total: number, count: number, first: string, locale: string): InstallmentValues[] {
  const n = Math.max(2, Math.floor(count))
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / n)
  return Array.from({ length: n }, (_, i) => ({
    label: '',
    dueDate: addMonths(first, i),
    amount: formatAmountInput((i === n - 1 ? cents - base * (n - 1) : base) / 100, locale),
  }))
}

export function installmentsTotal(rows: InstallmentValues[], locale: string): number {
  return rows.reduce((sum, row) => sum + (parseAmountInput(row.amount, locale) ?? 0), 0)
}

/** Lines are valid when each has a description, a quantity, a price and a sane tax rate. */
export function validateLines(lines: LineValues[], locale: string): string | null {
  for (const line of lines) {
    if (!line.description.trim()) return 'invoices.form.lineDescriptionRequired'
    const quantity = parseAmountInput(line.quantity, locale)
    const price = parseAmountInput(line.unitPrice || '0', locale)
    if (quantity === null || quantity < 0 || price === null) return 'invoices.form.lineInvalid'
    if (line.taxRate.trim()) {
      const rate = parseAmountInput(line.taxRate, locale)
      if (rate === null || rate < 0 || rate > 100) return 'invoices.form.taxInvalid'
    }
  }
  return null
}

/** The form's first problem as a translation key, or null when it can be sent. */
export function validateInvoiceForm(
  values: InvoiceFormValues,
  locale: string,
  { linesRequired = false, asDraft = false }: { linesRequired?: boolean; asDraft?: boolean } = {},
): string | null {
  if (linesRequired && values.lines.length === 0) return 'invoices.errors.lines_required'
  const lineProblem = validateLines(values.lines, locale)
  if (lineProblem) return lineProblem
  if (values.lines.length === 0) {
    const total = parseAmountInput(values.total, locale)
    // A draft may still be blank; anything that will be owed needs a value.
    if (values.total.trim() && (total === null || total < 0)) return 'invoices.form.amountInvalid'
    if (!asDraft && !(total && total > 0)) return 'invoices.form.amountRequired'
  } else if (!asDraft && linesTotal(values.lines, locale) <= 0) {
    return 'invoices.errors.empty_total'
  }
  if (values.installments) {
    // The server refuses a schedule that doesn't add up; say so before the submit.
    if (values.installments.length < 2) return 'invoices.errors.installments_too_few'
    for (const row of values.installments) {
      if (!row.dueDate) return 'invoices.errors.installment_due_required'
      const amount = parseAmountInput(row.amount, locale)
      if (amount === null || amount <= 0) return 'invoices.errors.installment_amount_not_positive'
    }
    if (Math.abs(installmentsTotal(values.installments, locale) - formTotal(values, locale)) >= 0.005) {
      return 'invoices.errors.installments_mismatch'
    }
  }
  return null
}

export function toLinePayload(line: LineValues, locale: string, showTax: boolean): Schemas['InvoiceLineInput'] {
  const rate = showTax && line.taxRate.trim() ? parseAmountInput(line.taxRate, locale) : null
  return {
    description: line.description.trim(),
    quantity: String(parseAmountInput(line.quantity, locale) ?? 1),
    unit: line.unit.trim() || null,
    unit_price: String(parseAmountInput(line.unitPrice || '0', locale) ?? 0),
    tax_rate: rate === null ? null : String(rate),
  }
}

function installmentsPayload(rows: InstallmentValues[], locale: string): Schemas['InstallmentInput'][] {
  return rows.map((row) => ({
    due_date: row.dueDate,
    amount: String(parseAmountInput(row.amount, locale) ?? 0),
    label: row.label.trim() || null,
  }))
}

function customPayload(custom: Record<string, string>): Record<string, string> | undefined {
  const entries = Object.entries(custom).filter(([, value]) => value.trim())
  return entries.length ? Object.fromEntries(entries.map(([k, v]) => [k, v.trim()])) : undefined
}

/** Lines are the source of truth once they exist: the server recomputes the total from them. */
export function toInvoiceCreate(
  values: InvoiceFormValues,
  locale: string,
  { direction, asDraft, showTax }: { direction: InvoiceDirection; asDraft: boolean; showTax: boolean },
): InvoiceCreate {
  const custom = customPayload(values.custom)
  return {
    direction,
    as_draft: asDraft,
    payee_id: values.payeeId,
    currency: values.currency,
    ...(values.lines.length
      ? { lines: values.lines.map((line) => toLinePayload(line, locale, showTax)) }
      : { total: String(parseAmountInput(values.total || '0', locale) ?? 0) }),
    // With a schedule, the due date is the last installment's.
    ...(values.installments
      ? { installments: installmentsPayload(values.installments, locale) }
      : values.dueDate
        ? { due_date: values.dueDate }
        : {}),
    notes: values.notes.trim() || null,
    ...(custom ? { custom_fields: custom } : {}),
  }
}

/**
 * Editing a draft. Removing the last line sends `lines: []` with the typed
 * amount, or the server keeps the old lines' total. The installments are
 * always sent, as on the web: an empty list clears the schedule.
 */
export function toInvoiceUpdate(
  values: InvoiceFormValues,
  locale: string,
  { hadLines, showTax }: { hadLines: boolean; showTax: boolean },
): InvoiceUpdate {
  const total = String(parseAmountInput(values.total || '0', locale) ?? 0)
  const custom = customPayload(values.custom)
  return {
    payee_id: values.payeeId,
    currency: values.currency,
    ...(!values.installments && values.dueDate ? { due_date: values.dueDate } : {}),
    notes: values.notes.trim() || null,
    ...(values.lines.length
      ? { lines: values.lines.map((line) => toLinePayload(line, locale, showTax)) }
      : hadLines
        ? { lines: [], total }
        : { total }),
    installments: values.installments ? installmentsPayload(values.installments, locale) : [],
    custom_fields: custom ?? null,
  }
}

/** Aging buckets, youngest first, as the web's bar reads them. */
export const AGING_BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const
export type AgingBucket = (typeof AGING_BUCKETS)[number]

/** Each bucket's share of the outstanding total (0..1); zeros when nothing is owed. */
export function agingShares(buckets: Record<AgingBucket, number | string>): Record<AgingBucket, number> {
  const values = AGING_BUCKETS.map((key) => Math.max(0, Number(buckets[key] ?? 0)))
  const total = values.reduce((a, b) => a + b, 0)
  return Object.fromEntries(AGING_BUCKETS.map((key, i) => [key, total > 0 ? values[i]! / total : 0])) as Record<AgingBucket, number>
}

/** Whether an issued invoice's own notes may still change (`notes` is always editable on the server). */
export function canEditNotes(invoice: Pick<Invoice, 'status'>): boolean {
  return invoice.status === 'open'
}

/** "Repeat this invoice": an issued receivable not already part of an agreement. */
export function canMakeRecurring(invoice: Pick<Invoice, 'direction' | 'status' | 'schedule_id'>): boolean {
  return invoice.direction === 'receivable' && invoice.status !== 'draft' && invoice.status !== 'void' && !invoice.schedule_id
}

/** Custom fields the workspace's invoice template defines (labels and keys). */
export function customFieldDefs(template: Record<string, unknown> | null | undefined): { key: string; label: string }[] {
  const defs = template?.custom_fields
  if (!Array.isArray(defs)) return []
  return defs
    .filter((d): d is { key: string; label?: unknown } => Boolean(d) && typeof (d as { key?: unknown }).key === 'string')
    .map((d) => ({ key: d.key, label: typeof d.label === 'string' && d.label ? d.label : d.key }))
}
