import { screen } from '@testing-library/react-native'

import { renderWithProviders } from '@/test/render'
import InvoiceScreen from '../../../app/(app)/invoices/[id]'
import type { Invoice } from './model'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 'inv-1' }),
  Stack: { Screen: () => null },
}))

const base = {
  id: 'inv-1',
  payee_id: 'p1',
  payee: { id: 'p1', name: 'Acme Client' },
  document_type: 'invoice',
  direction: 'receivable',
  origin: 'local',
  number: 1,
  series: null,
  issue_date: '2026-10-09',
  due_date: '2026-11-08',
  next_due_date: '2026-11-08',
  competence_date: null,
  sent_at: null,
  currency: 'USD',
  subtotal: '850.00',
  discount: '0.00',
  tax_total: '0.00',
  total: '850.00',
  amount_paid: '0.00',
  amount_deducted: '0.00',
  balance: '850.00',
  days_overdue: 0,
  notes: null,
  internal_notes: null,
  custom_fields: null,
  snapshot: { number_prefix: 'INV-' },
  lines: [
    { id: 'l1', description: 'Design work', quantity: '10.0000', unit: 'hours', unit_price: '85.00', tax_rate: null, total: '850.00', position: 0 },
  ],
  allocations: [],
  installments: [],
  deductions: [],
  created_at: '2026-10-09T00:00:00Z',
} as unknown as Invoice

function seed(invoice: Invoice, role = 'manager'): [unknown[], unknown][] {
  return [
    [['default', 'invoices', 'detail', 'inv-1'], invoice],
    [['default', 'invoices', 'settings'], { number_prefix: null, tax_fields: 'hidden', default_payment_terms_days: 30 }],
    [['me'], { id: 'u', email: 'me@example.com', preferences: { currency_display: 'USD', language: 'en' } }],
    [['settings', 'number-format'], { format: 'comma_dot' }],
    [['settings', 'date-format'], { format: 'mdy' }],
    [['workspaces'], []],
    [['workspaces', 'current', 'default'], { id: 'w', role }],
  ]
}

describe('invoice detail', () => {
  it('offers payment and write-off on a partly paid invoice, but not void', async () => {
    const partial = {
      ...base,
      status: 'open',
      state: 'partial',
      amount_paid: '500.00',
      balance: '350.00',
      allocations: [
        {
          id: 'a1',
          transaction_id: 't1',
          credit_note_id: null,
          amount: '500.00',
          method: 'manual',
          allocated_at: '2026-10-09T00:00:00Z',
          transaction: { id: 't1', description: 'ACME PAYMENT', date: '2026-10-09', amount: '500.00' },
        },
      ],
    } as Invoice
    await renderWithProviders(<InvoiceScreen />, seed(partial))

    expect(screen.getByText('Acme Client')).toBeOnTheScreen()
    expect(screen.getByText('Partly paid')).toBeOnTheScreen()
    expect(screen.getByText('ACME PAYMENT')).toBeOnTheScreen()
    expect(screen.getByText('Design work')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Write off' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Create share link' })).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Void' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Issue' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit notes' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Repeat this invoice' })).toBeOnTheScreen()
  })

  it('shows a viewer the document but no actions', async () => {
    await renderWithProviders(<InvoiceScreen />, seed({ ...base, status: 'draft', state: 'draft', number: null } as Invoice, 'viewer'))

    expect(screen.getByText('Draft')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Issue' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    // A draft was sent to nobody: no statement.
    expect(screen.queryByRole('button', { name: 'Download statement' })).toBeNull()
  })
})
