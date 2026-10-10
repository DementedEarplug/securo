import { fireEvent, screen } from '@testing-library/react-native'

import { renderWithProviders } from '@/test/render'
import { toIsoDate } from '@/lib/dates'
import { monthOf, monthRange, spendingRange } from '../calendar'
import { DEFAULT_FILTERS, rangeQuery } from '../filters'
import { SpendingCalendar } from './SpendingCalendar'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), replace: jest.fn() },
}))

const month = monthOf(new Date())
const range = monthRange(month)
const first = range.from
const last = range.to

const report = {
  summary: { primary_value: 0, change_amount: 0, change_percent: null, breakdowns: [] },
  trend: [{ date: first, value: -42, breakdowns: { income: 0, expenses: 42 } }],
  meta: { type: 'income_expenses', series_keys: [], currency: 'USD', interval: 'daily', baseline_active: false },
  composition: [],
  category_trend: [],
}

const seed: [unknown[], unknown][] = [
  [['me'], { id: 'u', email: 'me@example.com', preferences: { currency_display: 'USD', language: 'en' } }],
  [['settings', 'number-format'], { format: 'comma_dot' }],
  [['settings', 'date-format'], { format: 'mdy' }],
  [['default', 'reports', 'income-expenses', 'range', rangeQuery(spendingRange(range, toIsoDate(new Date()))!, 'daily', [])], report],
  [
    ['default', 'dashboard', 'projected', range, []],
    [
      {
        recurring_id: 'netflix',
        description: 'Netflix',
        amount: 15.49,
        currency: 'USD',
        type: 'debit',
        date: last,
        category_id: null,
        category_name: null,
        category_icon: null,
      },
    ],
  ],
  [['default', 'transactions', 'recurring-booked', range, []], []],
  [
    ['default', 'recurring'],
    [
      {
        id: 'netflix',
        description: 'Netflix',
        amount: '15.49',
        currency: 'USD',
        type: 'debit',
        frequency: 'monthly',
        is_active: true,
        account_id: 'a1',
        next_occurrence: last,
      },
    ],
  ],
]

beforeEach(() => mockPush.mockClear())

describe('SpendingCalendar', () => {
  it('shows the month, its recurring bills and subscriptions, and opens a recurring rule', async () => {
    await renderWithProviders(<SpendingCalendar filters={DEFAULT_FILTERS} />, seed)

    expect(screen.getByText('Bills & subscriptions')).toBeTruthy()
    expect(screen.getByText('$15.49/mo')).toBeTruthy()
    // On the month's list and among the subscriptions.
    expect(screen.getAllByText('Netflix')).toHaveLength(2)

    await fireEvent.press(screen.getAllByText('Netflix')[1]!)
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/recurring/form', params: { id: 'netflix' } })
  })

  it('opens a day and drills into its transactions', async () => {
    await renderWithProviders(<SpendingCalendar filters={DEFAULT_FILTERS} />, seed)

    await fireEvent.press(screen.getByLabelText(/spent \$42\.00/))
    expect(screen.getByText('Spent this day')).toBeTruthy()
    await fireEvent.press(screen.getByText("See this day's transactions"))

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/transaction/list',
      params: expect.objectContaining({ from: first, to: first, type: 'debit' }),
    })
  })

  it('hides the bills when showing spending only', async () => {
    await renderWithProviders(<SpendingCalendar filters={DEFAULT_FILTERS} />, seed)

    await fireEvent.press(screen.getByRole('radio', { name: 'Spending' }))
    expect(screen.queryByText('Bills & subscriptions')).toBeNull()
    expect(screen.getByText('Spent this month')).toBeTruthy()
  })
})
