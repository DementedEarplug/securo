import { fireEvent, screen } from '@testing-library/react-native'

import { renderWithProviders } from '@/test/render'
import { DEFAULT_FILTERS, rangeQuery, resolveRange } from '../filters'
import { payeeQuery } from '../payees'
import { TopPayees } from './TopPayees'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), replace: jest.fn() },
}))

const range = resolveRange(DEFAULT_FILTERS)

const payees = {
  items: [
    { payee_id: 'p-rent', name: 'Landlord', total: 1500, previous_total: 1500, count: 1 },
    { payee_id: 'p-cafe', name: 'Cafe', total: 105, previous_total: 0, count: 12 },
  ],
  unassigned: { total: 395, count: 4, previous_total: 300 },
  meta: {
    currency: 'USD',
    type: 'debit',
    start_date: range.from,
    end_date: range.to,
    previous_start_date: '2025-10-01',
    previous_end_date: '2026-03-31',
  },
}

const incomeExpenses = {
  summary: {
    primary_value: 0,
    change_amount: 0,
    change_percent: null,
    breakdowns: [
      { key: 'income', label: 'Income', value: 3000, color: '' },
      { key: 'expenses', label: 'Expenses', value: 2000, color: '' },
    ],
  },
  trend: [],
  composition: [],
  category_trend: [],
  meta: { type: 'income_expenses', series_keys: [], currency: 'USD', interval: 'monthly', baseline_active: false },
}

const seed: [unknown[], unknown][] = [
  [['me'], { id: 'u', email: 'me@example.com', preferences: { currency_display: 'USD', language: 'en' } }],
  [['settings', 'number-format'], { format: 'comma_dot' }],
  [['settings', 'date-format'], { format: 'mdy' }],
  [['default', 'reports', 'payees', payeeQuery(range, 'debit', 10, [])], payees],
  [['default', 'reports', 'income-expenses', 'range', rangeQuery(range, 'monthly', [])], incomeExpenses],
]

beforeEach(() => mockPush.mockClear())

describe('Top payees', () => {
  it('ranks payees with their share of all spending and flags new ones', async () => {
    await renderWithProviders(<TopPayees filters={DEFAULT_FILTERS} />, seed)

    expect(screen.getByLabelText('Landlord, $1,500.00, 1 transaction · 75.0%')).toBeTruthy()
    expect(screen.getByLabelText('Cafe, $105.00, 12 transactions · 5.3%')).toBeTruthy()
    expect(screen.getByText('New')).toBeTruthy()
    // Rows without a payee are listed apart, not ranked.
    expect(screen.getByText('No payee')).toBeTruthy()
    expect(screen.getByText('4 transactions · 19.8%')).toBeTruthy()
  })

  it('opens the payee transactions for the range', async () => {
    await renderWithProviders(<TopPayees filters={DEFAULT_FILTERS} />, seed)
    await fireEvent.press(screen.getByLabelText(/^Cafe,/))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/transaction/list',
      params: { title: 'Cafe', from: range.from, to: range.to, payeeId: 'p-cafe', type: 'debit' },
    })
  })

  it('edits the payee on a long press', async () => {
    await renderWithProviders(<TopPayees filters={DEFAULT_FILTERS} />, seed)
    await fireEvent(screen.getByLabelText(/^Landlord,/), 'longPress')
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/payees/form', params: { id: 'p-rent' } })
  })
})
