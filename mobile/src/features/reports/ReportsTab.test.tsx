import { fireEvent, screen } from '@testing-library/react-native'

import ReportsScreen from '../../../app/(app)/(tabs)/reports'
import { renderWithProviders } from '@/test/render'
import { DEFAULT_FILTERS, defaultInterval, reportQuery, resolveRange } from './filters'
import { resetRememberedReportFilters } from './ReportFiltersContext'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}))

const filters = { ...DEFAULT_FILTERS, interval: defaultInterval(resolveRange(DEFAULT_FILTERS)) }
const range = resolveRange(filters)

const report = {
  summary: {
    primary_value: 0,
    change_amount: 0,
    change_percent: null,
    breakdowns: [
      { key: 'income', label: 'Income', value: 3000, color: '' },
      { key: 'expenses', label: 'Expenses', value: 1000, color: '' },
    ],
  },
  trend: [],
  meta: { type: 'income_expenses', series_keys: [], currency: 'USD', interval: 'monthly', baseline_active: false },
  composition: [
    { key: 'food', label: 'Food', value: 250, color: '#F97316', group: 'expenses' },
    { key: 'rent', label: 'Rent', value: 750, color: '#3B82F6', group: 'expenses' },
    { key: 'salary', label: 'Salary', value: 3000, color: '#10B981', group: 'income' },
  ],
  category_trend: [],
}

const seed: [unknown[], unknown][] = [
  [['me'], { id: 'u', email: 'me@example.com', preferences: { currency_display: 'USD', language: 'en' } }],
  [['settings', 'number-format'], { format: 'comma_dot' }],
  [['settings', 'date-format'], { format: 'mdy' }],
  [['default', 'reports', 'income-expenses', 'range', reportQuery(filters)], report],
  [['default', 'categories', 'all'], []],
  [
    ['default', 'accounts', { includeClosed: false }],
    [{ id: 'acc1', name: 'Checking', currency: 'USD', type: 'checking', is_closed: false }],
  ],
]

beforeEach(() => {
  mockPush.mockClear()
  resetRememberedReportFilters()
})

describe('Reports tab', () => {
  it('shows spending by category for the default range, and drills into a category', async () => {
    await renderWithProviders(<ReportsScreen />, seed)

    expect(screen.getByRole('tab', { name: 'By category', selected: true })).toBeTruthy()
    expect(screen.getByLabelText(/^Date range: Last 6 months/)).toBeTruthy()
    // Largest first, with its share.
    expect(screen.getByLabelText('Rent, $750.00, 75.0%')).toBeTruthy()

    await fireEvent.press(screen.getByLabelText('Food, $250.00, 25.0%'))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/transaction/list',
      params: { title: 'Food', from: range.from, to: range.to, categoryIds: 'food', type: 'debit' },
    })
  })

  it('switches to income categories', async () => {
    await renderWithProviders(<ReportsScreen />, seed)
    await fireEvent.press(screen.getByRole('radio', { name: 'Income' }))
    expect(screen.getByLabelText('Salary, $3,000.00, 100.0%')).toBeTruthy()
    expect(screen.queryByLabelText(/^Rent/)).toBeNull()
  })

  it('changes the range from the presets sheet', async () => {
    await renderWithProviders(<ReportsScreen />, seed)
    await fireEvent.press(screen.getByLabelText(/^Date range:/))
    await fireEvent.press(screen.getByLabelText('Last month'))
    expect(screen.getByLabelText(/^Date range: Last month/)).toBeTruthy()
  })

  it('filters by account', async () => {
    await renderWithProviders(<ReportsScreen />, seed)
    await fireEvent.press(screen.getByLabelText('Accounts: All accounts'))
    await fireEvent.press(screen.getByLabelText('Checking'))
    expect(screen.getByLabelText('Accounts: 1 account')).toBeTruthy()
  })

  it('offers the interval only on reports that use it', async () => {
    await renderWithProviders(<ReportsScreen />, seed)
    expect(screen.queryByRole('radio', { name: 'Month' })).toBeNull()
    await fireEvent.press(screen.getByRole('tab', { name: 'Category trends' }))
    const month = screen.getByRole('radio', { name: 'Month' })
    expect(month.props.accessibilityState).toMatchObject({ checked: true })
    // Six months is too long for daily buckets.
    expect(screen.getByRole('radio', { name: 'Week' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Day' })).toBeNull()
  })
})
