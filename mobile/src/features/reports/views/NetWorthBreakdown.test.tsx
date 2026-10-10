import { fireEvent, screen } from '@testing-library/react-native'

import { renderWithProviders } from '@/test/render'
import { DEFAULT_FILTERS, rangeQuery, reportQuery } from '../filters'
import { monthWindow, previousMonth } from '../monthly'
import { toMonth } from '@/lib/dates'
import { MonthVsLast } from './MonthVsLast'
import { NetWorthBreakdown } from './NetWorthBreakdown'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}))

const base: [unknown[], unknown][] = [
  [['me'], { id: 'u', email: 'me@example.com', preferences: { currency_display: 'USD', language: 'en' } }],
  [['settings', 'number-format'], { format: 'comma_dot' }],
  [['settings', 'date-format'], { format: 'mdy' }],
  [['default', 'asset-groups'], []],
  [['default', 'dashboard', 'summary'], { primary_currency: 'USD' }],
]

const composition = [
  { key: 'chk', label: 'Checking', value: 2000, color: '', group: 'accounts' },
  { key: 'car', label: 'Car', value: 8000, color: '', group: 'assets' },
  { key: 'visa', label: 'Visa', value: 500, color: '', group: 'liabilities' },
]

const netWorth = {
  summary: { primary_value: 9500, change_amount: 500, change_percent: 5.56, breakdowns: [] },
  trend: [
    { date: '2026-09', value: 9000, breakdowns: { accounts: 1500, assets: 8000, liabilities: 500 }, composition },
    { date: '2026-10', value: 9500, breakdowns: { accounts: 2000, assets: 8000, liabilities: 500 }, composition },
  ],
  meta: { type: 'net_worth', series_keys: [], currency: 'USD', interval: 'monthly', baseline_active: false },
  composition,
  category_trend: [],
}

beforeEach(() => mockPush.mockClear())

describe('Net worth breakdown', () => {
  it('shows net worth, its parts and composition, and opens a holding', async () => {
    const filters = { ...DEFAULT_FILTERS, interval: 'monthly' as const }
    await renderWithProviders(<NetWorthBreakdown filters={filters} />, [
      ...base,
      [['default', 'reports', 'net-worth', 'breakdown', reportQuery(filters)], netWorth],
    ])

    expect(screen.getAllByText('$9,500.00').length).toBeGreaterThan(0)
    expect(screen.getByText('▲ $500.00 (5.6%)')).toBeTruthy()
    expect(screen.getByText('Debts')).toBeTruthy()

    await fireEvent.press(screen.getByRole('radio', { name: 'What you owe' }))
    expect(screen.queryByText('Checking')).toBeNull()
    await fireEvent.press(screen.getByText('Visa'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/account/[id]', params: { id: 'visa' } })
  })
})

describe('This month vs last', () => {
  it('compares spending so far with last month by the same day', async () => {
    const month = toMonth(new Date())
    const current = monthWindow(month)
    const previous = monthWindow(previousMonth(month))
    const daily = (from: string, amount: number) => ({
      summary: { primary_value: 0, change_amount: 0, change_percent: null, breakdowns: [] },
      trend: [{ date: from, value: -amount, breakdowns: { income: 0, expenses: amount } }],
      meta: { type: 'income_expenses', series_keys: [], currency: 'USD', interval: 'daily', baseline_active: false },
      composition: [],
      category_trend: [],
    })
    await renderWithProviders(<MonthVsLast filters={DEFAULT_FILTERS} />, [
      ...base,
      [['default', 'reports', 'income-expenses', 'range', rangeQuery(current.elapsed, 'daily', [])], daily(current.full.from, 150)],
      [['default', 'reports', 'income-expenses', 'range', rangeQuery(previous.full, 'daily', [])], daily(previous.full.from, 100)],
    ])

    expect(screen.getByText('Spent so far this month')).toBeTruthy()
    expect(screen.getByText('$150.00')).toBeTruthy()
    // Spending up is bad: shown as a rise of $50 (50%) against last month.
    expect(screen.getByText('▲ $50.00 (50.0%)')).toBeTruthy()

    await fireEvent.press(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('Spent so far this month')).toBeTruthy()
  })
})
