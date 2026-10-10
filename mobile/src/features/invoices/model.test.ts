import type { TFunction } from 'i18next'

import { ApiError } from '@/api/errors'
import type { Transaction } from '@/api/types'
import {
  addMonths,
  agingShares,
  applyFilter,
  canEditNotes,
  canMakeRecurring,
  installmentsTotal,
  splitEvenly,
  availableActions,
  customFieldDefs,
  displayNumber,
  emptyInvoiceValues,
  emptyLine,
  invoiceErrorMessage,
  invoiceValuesFrom,
  linesTotal,
  paymentCandidates,
  paymentShortfall,
  shareUrl,
  stateParam,
  toInvoiceCreate,
  toInvoiceUpdate,
  validateInvoiceForm,
  type Invoice,
  type InvoiceFormValues,
} from './model'

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    payee_id: null,
    document_type: 'invoice',
    direction: 'receivable',
    origin: 'local',
    number: null,
    series: null,
    status: 'draft',
    state: 'draft',
    issue_date: '2026-10-01',
    due_date: '2026-10-31',
    competence_date: null,
    sent_at: null,
    currency: 'USD',
    subtotal: '100.00',
    discount: '0.00',
    tax_total: '0.00',
    total: '100.00',
    balance: '100.00',
    notes: null,
    internal_notes: null,
    custom_fields: null,
    snapshot: null,
    lines: [],
    allocations: [],
    created_at: '2026-10-01T00:00:00Z',
    ...overrides,
  } as Invoice
}

const tx = (overrides: Partial<Transaction>): Transaction =>
  ({ id: 'tx', amount: '100', currency: 'USD', invoice_links: [], description: 'x', date: '2026-10-01', ...overrides }) as Transaction

describe('filters', () => {
  it('asks the server for single states and filters "open" locally', () => {
    expect(stateParam('all')).toBeUndefined()
    expect(stateParam('open')).toBeUndefined()
    expect(stateParam('overdue')).toBe('overdue')
    const list = [invoice({ state: 'open' }), invoice({ state: 'partial' }), invoice({ state: 'paid' }), invoice({ state: 'overdue' })]
    expect(applyFilter(list, 'open').map((i) => i.state)).toEqual(['open', 'partial', 'overdue'])
    expect(applyFilter(list, 'all')).toHaveLength(4)
  })
})

describe('availableActions', () => {
  it('lets a draft be edited, issued and deleted, never shared', () => {
    const a = availableActions(invoice())
    expect(a).toMatchObject({ canEdit: true, canIssue: true, canDelete: true, canVoid: false, canShare: false, canStatement: false })
  })

  it('only voids an open invoice without payments', () => {
    expect(availableActions(invoice({ status: 'open', state: 'open' })).canVoid).toBe(true)
    const paid = invoice({ status: 'open', state: 'partial', allocations: [{ id: 'a' } as never], balance: '20' })
    expect(availableActions(paid)).toMatchObject({ canVoid: false, canWriteOff: true, canAllocate: true })
  })

  it('stops offering payments once settled, and reopens only uncollectible', () => {
    expect(availableActions(invoice({ status: 'open', state: 'paid', balance: '0.00' })).canAllocate).toBe(false)
    expect(availableActions(invoice({ status: 'uncollectible', state: 'uncollectible' })).canReopen).toBe(true)
  })

  it('never shares a bill we received', () => {
    expect(availableActions(invoice({ status: 'open', direction: 'payable' })).canShare).toBe(false)
    expect(availableActions(invoice({ status: 'open', origin: 'imported' })).canStatement).toBe(false)
  })
})

describe('displayNumber', () => {
  it('has no number for a draft', () => {
    expect(displayNumber(invoice(), 'INV-')).toBeNull()
  })

  it('keeps the prefix frozen on issue, even an empty one', () => {
    expect(displayNumber(invoice({ number: 7, snapshot: { number_prefix: 'A-' } }), 'B-')).toBe('A-7')
    expect(displayNumber(invoice({ number: 7, snapshot: { number_prefix: null } }), 'B-')).toBe('7')
    expect(displayNumber(invoice({ number: 7 }), 'B-')).toBe('B-7')
  })

  it("uses an imported document's own name", () => {
    expect(displayNumber(invoice({ origin: 'imported', number: 3, external_number: '2026/A/0031' }))).toBe('2026/A/0031')
  })
})

it('builds the public link from the server URL', () => {
  expect(shareUrl('https://money.example.com/', 'abc')).toBe('https://money.example.com/i/abc')
})

describe('invoiceErrorMessage', () => {
  const t = ((key: string, opts?: { defaultValue?: string }) =>
    key === 'invoices.errors.void_with_allocations' ? 'Unlink first' : (opts?.defaultValue ?? key)) as unknown as TFunction

  it('translates a known rule code', () => {
    expect(invoiceErrorMessage(new ApiError(400, 'Unlink the payments', 'void_with_allocations'), t)).toBe('Unlink first')
  })

  it('falls back to the server message for unknown codes', () => {
    expect(invoiceErrorMessage(new ApiError(400, 'Something new', 'brand_new_rule'), t)).toBe('Something new')
  })
})

describe('paymentCandidates', () => {
  it('keeps money in the same currency with something left to give', () => {
    const candidates = paymentCandidates(
      [
        tx({ id: 'ok' }),
        tx({ id: 'eur', currency: 'EUR' }),
        tx({ id: 'linked-here', invoice_links: [{ invoice_id: 'inv-1', amount: '10' } as never] }),
        tx({ id: 'spent', invoice_links: [{ invoice_id: 'other', amount: '100' } as never] }),
        tx({ id: 'half', invoice_links: [{ invoice_id: 'other', amount: '50' } as never] }),
      ],
      invoice(),
    )
    expect(candidates.map((c) => c.id)).toEqual(['ok', 'half'])
  })

  it('reports what a payment leaves short', () => {
    expect(paymentShortfall(100, 100, 90, null)).toBe(10)
    expect(paymentShortfall(100, 100, 150, null)).toBe(0)
    expect(paymentShortfall(100, 100, 150, 60)).toBe(40)
  })
})

describe('form', () => {
  const base = (overrides: Partial<InvoiceFormValues> = {}): InvoiceFormValues => ({ ...emptyInvoiceValues('USD'), ...overrides })

  it('sums lines in the display locale', () => {
    const lines = [
      { ...emptyLine(), description: 'a', quantity: '2', unitPrice: '10,50' },
      { ...emptyLine(), description: 'b', quantity: '1,5', unitPrice: '4' },
    ]
    expect(linesTotal(lines, 'pt-BR')).toBeCloseTo(27)
  })

  it('needs an amount unless it is a draft', () => {
    expect(validateInvoiceForm(base(), 'en-US')).toBe('invoices.form.amountRequired')
    expect(validateInvoiceForm(base(), 'en-US', { asDraft: true })).toBeNull()
    expect(validateInvoiceForm(base({ total: 'abc' }), 'en-US', { asDraft: true })).toBe('invoices.form.amountInvalid')
    expect(validateInvoiceForm(base({ total: '150' }), 'en-US')).toBeNull()
  })

  it('checks every line', () => {
    expect(validateInvoiceForm(base({ lines: [emptyLine()] }), 'en-US')).toBe('invoices.form.lineDescriptionRequired')
    const line = { ...emptyLine(), description: 'Work', quantity: '2', unitPrice: '50' }
    expect(validateInvoiceForm(base({ lines: [{ ...line, taxRate: '120' }] }), 'en-US')).toBe('invoices.form.taxInvalid')
    expect(validateInvoiceForm(base({ lines: [{ ...line, unitPrice: '0' }] }), 'en-US')).toBe('invoices.errors.empty_total')
    expect(validateInvoiceForm(base({ lines: [line] }), 'en-US')).toBeNull()
    expect(validateInvoiceForm(base(), 'en-US', { linesRequired: true })).toBe('invoices.errors.lines_required')
  })

  it('sends lines instead of a total once there are any', () => {
    const values = base({
      payeeId: 'p1',
      total: '999',
      dueDate: '2026-11-30',
      notes: '  Thanks ',
      lines: [{ description: ' Design ', quantity: '10', unit: 'hours', unitPrice: '85,5', taxRate: '5' }],
      custom: { po: 'PO-1', empty: '  ' },
    })
    expect(toInvoiceCreate(values, 'pt-BR', { direction: 'receivable', asDraft: true, showTax: true })).toEqual({
      direction: 'receivable',
      as_draft: true,
      payee_id: 'p1',
      currency: 'USD',
      lines: [{ description: 'Design', quantity: '10', unit: 'hours', unit_price: '85.5', tax_rate: '5' }],
      due_date: '2026-11-30',
      notes: 'Thanks',
      custom_fields: { po: 'PO-1' },
    })
  })

  it('omits tax when the workspace hides it, and the due date when using terms', () => {
    const values = base({ lines: [{ ...emptyLine(), description: 'x', unitPrice: '1', taxRate: '5' }] })
    const body = toInvoiceCreate(values, 'en-US', { direction: 'payable', asDraft: false, showTax: false })
    expect(body.lines?.[0]?.tax_rate).toBeNull()
    expect(body).not.toHaveProperty('due_date')
    expect(toInvoiceCreate(base({ total: '12.5' }), 'en-US', { direction: 'receivable', asDraft: false, showTax: false }).total).toBe('12.5')
  })

  it('clears the lines when the last one is removed from a draft that had them', () => {
    const update = toInvoiceUpdate(base({ total: '40' }), 'en-US', { hadLines: true, showTax: false })
    expect(update).toMatchObject({ lines: [], total: '40', custom_fields: null })
    expect(toInvoiceUpdate(base({ total: '40' }), 'en-US', { hadLines: false, showTax: false })).not.toHaveProperty('lines')
  })

  it('round-trips an invoice into the form', () => {
    const values = invoiceValuesFrom(
      invoice({
        payee_id: 'p1',
        total: '850.00',
        notes: 'n',
        custom_fields: { po: 'X' },
        lines: [
          {
            id: 'l',
            description: 'Design',
            quantity: '10.0000',
            unit: 'hours',
            unit_price: '85.00',
            tax_rate: null,
            total: '850.00',
            position: 0,
          },
        ],
      }),
      'pt-BR',
    )
    expect(values).toMatchObject({
      payeeId: 'p1',
      total: '850',
      dueDate: '2026-10-31',
      lines: [{ description: 'Design', quantity: '10', unit: 'hours', unitPrice: '85', taxRate: '' }],
      custom: { po: 'X' },
    })
  })
})

it('reads custom field definitions from the template', () => {
  expect(customFieldDefs({ custom_fields: [{ key: 'po', label: 'PO number' }, { key: 'ref' }, { label: 'no key' }] })).toEqual([
    { key: 'po', label: 'PO number' },
    { key: 'ref', label: 'ref' },
  ])
  expect(customFieldDefs(null)).toEqual([])
})

describe('installments', () => {
  const base = (overrides: Partial<InvoiceFormValues> = {}): InvoiceFormValues => ({ ...emptyInvoiceValues('USD'), ...overrides })

  it('adds months clamping the day to the month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15')
  })

  it('splits evenly with the leftover cents on the last one', () => {
    const rows = splitEvenly(100, 3, '2026-10-31', 'en-US')
    expect(rows.map((r) => r.amount)).toEqual(['33.33', '33.33', '33.34'])
    expect(rows.map((r) => r.dueDate)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31'])
    expect(installmentsTotal(rows, 'en-US')).toBeCloseTo(100)
    expect(splitEvenly(10, 1, '2026-10-01', 'pt-BR')).toHaveLength(2)
    expect(splitEvenly(10, 2, '2026-10-01', 'pt-BR')[0]!.amount).toBe('5')
  })

  it('refuses a schedule that does not add up', () => {
    const rows = splitEvenly(100, 2, '2026-10-31', 'en-US')
    expect(validateInvoiceForm(base({ total: '100', installments: rows }), 'en-US')).toBeNull()
    expect(validateInvoiceForm(base({ total: '120', installments: rows }), 'en-US')).toBe('invoices.errors.installments_mismatch')
    expect(validateInvoiceForm(base({ total: '100', installments: [rows[0]!] }), 'en-US')).toBe('invoices.errors.installments_too_few')
    expect(validateInvoiceForm(base({ total: '100', installments: [{ ...rows[0]!, amount: '0' }, rows[1]!] }), 'en-US')).toBe(
      'invoices.errors.installment_amount_not_positive',
    )
  })

  it('sends installments instead of a due date', () => {
    const values = base({ total: '100', dueDate: '2026-10-31', installments: [{ label: ' 1/2 ', dueDate: '2026-10-31', amount: '50' }, { label: '', dueDate: '2026-11-30', amount: '50' }] })
    const body = toInvoiceCreate(values, 'en-US', { direction: 'receivable', asDraft: false, showTax: false })
    expect(body).not.toHaveProperty('due_date')
    expect(body.installments).toEqual([
      { due_date: '2026-10-31', amount: '50', label: '1/2' },
      { due_date: '2026-11-30', amount: '50', label: null },
    ])
    // Editing always sends the schedule; none clears it.
    expect(toInvoiceUpdate(base({ total: '1' }), 'en-US', { hadLines: false, showTax: false }).installments).toEqual([])
    expect(toInvoiceUpdate(values, 'en-US', { hadLines: false, showTax: false })).not.toHaveProperty('due_date')
  })

  it('reads an invoice schedule back into the form', () => {
    const values = invoiceValuesFrom(
      invoice({ installments: [{ id: 'i', position: 0, label: null, due_date: '2026-10-31', amount: '60.00' } as never] }),
      'en-US',
    )
    expect(values.installments).toEqual([{ label: '', dueDate: '2026-10-31', amount: '60' }])
    expect(invoiceValuesFrom(invoice(), 'en-US').installments).toBeNull()
  })
})

describe('list and detail helpers', () => {
  it('shares the aging buckets', () => {
    const shares = agingShares({ current: '75', d1_30: '25', d31_60: '0', d61_90: '0', d90_plus: '0' })
    expect(shares.current).toBeCloseTo(0.75)
    expect(shares.d1_30).toBeCloseTo(0.25)
    expect(agingShares({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 }).current).toBe(0)
  })

  it('edits notes only on an issued, live invoice', () => {
    expect(canEditNotes(invoice({ status: 'open' }))).toBe(true)
    expect(canEditNotes(invoice({ status: 'draft' }))).toBe(false)
    expect(canEditNotes(invoice({ status: 'void' }))).toBe(false)
  })

  it('repeats only an issued receivable outside any agreement', () => {
    expect(canMakeRecurring(invoice({ status: 'open' }))).toBe(true)
    expect(canMakeRecurring(invoice({ status: 'open', schedule_id: 's' }))).toBe(false)
    expect(canMakeRecurring(invoice({ status: 'open', direction: 'payable' }))).toBe(false)
    expect(canMakeRecurring(invoice())).toBe(false)
  })
})
