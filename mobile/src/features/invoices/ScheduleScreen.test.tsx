import { screen } from '@testing-library/react-native'

import { renderWithProviders } from '@/test/render'
import ScheduleScreen from '../../../app/(app)/invoices/schedules/[id]'
import type { Schedule } from './schedules'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 's1' }),
  Stack: { Screen: () => null },
}))

const term = {
  id: 't1',
  effective_from: '2026-01-01',
  lines: [{ description: 'Hosting', quantity: '1', unit_price: '100' }],
  discount: '0',
  subtotal: '100',
  tax_total: '0',
  total: '100.00',
  created_at: '2026-01-01T00:00:00Z',
}

const schedule = {
  id: 's1',
  name: 'Hosting plan',
  payee_id: 'p1',
  payee: { id: 'p1', name: 'Acme Client' },
  origin: 'local',
  status: 'active',
  pause_reason: null,
  frequency: 'monthly',
  start_date: '2026-01-01',
  end_type: 'never',
  currency: 'USD',
  next_sequence: 2,
  consecutive_failures: 0,
  terms: [term],
  current_term: term,
  monthly_amount: '100.00',
  next_period_start: '2026-11-01',
  invoice_count: 1,
  amount_invoiced: '100.00',
  amount_paid: '0.00',
  past_due_count: 1,
  created_at: '2026-01-01T00:00:00Z',
} as unknown as Schedule

function seed(role = 'manager'): [unknown[], unknown][] {
  return [
    [['default', 'invoices', 'schedules', 'detail', 's1'], schedule],
    [['default', 'invoices', 'schedules', 'invoices', 's1'], []],
    [['default', 'invoices', 'settings'], { number_prefix: null, tax_fields: 'hidden', default_payment_terms_days: 30 }],
    [['me'], { id: 'u', email: 'me@example.com', preferences: { currency_display: 'USD', language: 'en' } }],
    [['settings', 'number-format'], { format: 'comma_dot' }],
    [['settings', 'date-format'], { format: 'mdy' }],
    [['workspaces'], []],
    [['workspaces', 'current', 'default'], { id: 'w', role }],
  ]
}

describe('schedule detail', () => {
  it('shows what an active agreement bills and what can be done with it', async () => {
    await renderWithProviders(<ScheduleScreen />, seed())

    expect(screen.getByText('Acme Client')).toBeOnTheScreen()
    expect(screen.getByText('Past due')).toBeOnTheScreen()
    expect(screen.getByText('1 invoice past due')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Issue next now' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Change price' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'End agreement' })).toBeOnTheScreen()
    // An invoice was billed under it, so it can only be ended.
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('shows a viewer no actions', async () => {
    await renderWithProviders(<ScheduleScreen />, seed('viewer'))

    expect(screen.getByText('Acme Client')).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Link invoice' })).toBeNull()
  })
})
