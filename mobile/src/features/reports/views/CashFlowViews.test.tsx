import { fireEvent, screen } from '@testing-library/react-native'
import { addDays } from 'date-fns'

import type { Report } from '@/api/types'
import { toIsoDate } from '@/lib/dates'
import { renderWithProviders } from '@/test/render'
import { DEFAULT_FILTERS, previousRange, rangeQuery, reportQuery, resolveRange, type ReportFilters } from '../filters'
import { CashFlow } from './CashFlow'
import { IncomeExpenses } from './IncomeExpenses'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), replace: jest.fn() },
}))

const filters: ReportFilters = { ...DEFAULT_FILTERS, interval: 'monthly' }
const range = resolveRange(filters)

function report(income: number, expenses: number, trend: Report['trend'] = [], meta: Partial<Report['meta']> = {}): Report {
  return {
    summary: {
      primary_value: 0,
      change_amount: 0,
      change_percent: null,
      breakdowns: [
        { key: 'income', label: 'Income', value: income, color: '' },
        { key: 'expenses', label: 'Expenses', value: expenses, color: '' },
      ],
    },
    trend,
    meta: { type: 'income_expenses', series_keys: [], currency: 'USD', interval: 'monthly', baseline_active: false, ...meta },
    composition: [],
    category_trend: [],
  } as Report
}

const point = (date: string, value: number, breakdowns: Record<string, number>) =>
  ({ date, value, breakdowns, composition: [] }) as unknown as Report['trend'][number]

const base: [unknown[], unknown][] = [
  [['me'], { id: 'u', email: 'me@example.com', preferences: { currency_display: 'USD', language: 'en' } }],
  [['settings', 'number-format'], { format: 'comma_dot' }],
  [['settings', 'date-format'], { format: 'mdy' }],
  [['default', 'accounts', { includeClosed: false }], [{ id: 'acc1', name: 'Checking', currency: 'USD', type: 'checking', is_closed: false }]],
]

beforeEach(() => mockPush.mockClear())

describe('Income vs expenses', () => {
  const [first, second] = [range.to.slice(0, 7), range.from.slice(0, 7)]
  const current = report(5000, 3000, [point(second, 0, { income: 2000, expenses: 2000 }), point(first, 0, { income: 3000, expenses: 1000 })])
  const before = previousRange(range, 'previous')
  const seed: [unknown[], unknown][] = [
    ...base,
    [['default', 'reports', 'income-expenses', 'range', reportQuery(filters)], current],
    [['default', 'reports', 'income-expenses', 'range', rangeQuery(before, 'monthly', [])], report(4000, 3600)],
  ]

  it('shows the savings rate and how it moved', async () => {
    await renderWithProviders(<IncomeExpenses filters={filters} />, seed)
    expect(screen.getByText('Savings rate')).toBeTruthy()
    expect(screen.getByText('40.0%')).toBeTruthy()
    expect(screen.getByText('▲ 30.0 pts')).toBeTruthy()
    // Per period, newest first: 2,000 net (66.7% saved), then break-even.
    expect(screen.getByText('66.7% saved')).toBeTruthy()
    expect(screen.getByText('0.0% saved')).toBeTruthy()
  })

  it('opens the spending behind the total', async () => {
    await renderWithProviders(<IncomeExpenses filters={filters} />, seed)
    await fireEvent.press(screen.getAllByText('Spending')[0]!)
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/transaction/list',
      params: { title: 'Spending', from: range.from, to: range.to, type: 'debit' },
    })
  })
})

describe('Cash flow', () => {
  const today = new Date()
  const iso = (days: number) => toIsoDate(addDays(today, days))
  const cashFlow = {
    ...report(0, 0, [
      point(iso(-1), 950, { inflow: 0, outflow: 50 }),
      point(iso(0), 1000, { inflow: 50, outflow: 0 }),
      point(iso(1), -200, { inflow: 0, outflow: 1200 }),
      point(iso(2), 900, { inflow: 1100, outflow: 0 }),
    ], { type: 'cash_flow', interval: 'daily', forecast_start_date: iso(0) }),
    summary: {
      primary_value: 900,
      change_amount: -100,
      change_percent: -10,
      breakdowns: [
        { key: 'startingBalance', label: '', value: 1000, color: '' },
        { key: 'projectedIncome', label: '', value: 1100, color: '' },
        { key: 'projectedExpenses', label: '', value: 1200, color: '' },
        { key: 'endingBalance', label: '', value: 900, color: '' },
      ],
    },
  } as Report
  const seed: [unknown[], unknown][] = [
    ...base,
    [['default', 'reports', 'cash-flow', { months: 6, interval: 'daily', baseline: false }], cashFlow],
    [
      ['default', 'dashboard', 'projected-transactions', { from: iso(1), to: iso(30) }],
      [
        {
          account_id: 'acc1',
          amount: 1200,
          amount_primary: null,
          category_color: null,
          category_icon: null,
          category_id: null,
          category_name: 'Housing',
          currency: 'USD',
          date: iso(1),
          description: 'Rent',
          recurring_id: 'r1',
          type: 'debit',
        },
      ],
    ],
  ]

  it('summarises the forecast, warns about a negative balance and lists what is due', async () => {
    await renderWithProviders(<CashFlow filters={DEFAULT_FILTERS} />, seed)
    expect(screen.getByText('Balance today')).toBeTruthy()
    expect(screen.getByText('Balance in 6 months')).toBeTruthy()
    expect(screen.getByText(/^Your balance is projected to go negative/)).toBeTruthy()
    expect(screen.getByText('Recurring in the next 30 days')).toBeTruthy()
    expect(screen.getByText('Rent')).toBeTruthy()
  })

  it('shows a point and opens the transactions of an actual day', async () => {
    await renderWithProviders(<CashFlow filters={DEFAULT_FILTERS} />, seed)
    // The chart draws once it knows its width; its points are then buttons, the first being yesterday.
    await fireEvent(screen.getByLabelText(/^Balance \$1,000\.00 today/), 'layout', { nativeEvent: { layout: { width: 300, height: 200 } } })
    const buttons = screen.getAllByRole('button').filter((b) => /^\w{3} \d{1,2}$/.test(String(b.props.accessibilityLabel)))
    expect(buttons).toHaveLength(4)
    await fireEvent.press(buttons[0]!)
    expect(screen.getByText('Money in')).toBeTruthy()
    await fireEvent.press(screen.getByText('See transactions'))
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/transaction/list', params: expect.objectContaining({ from: iso(-1), to: iso(-1) }) }),
    )
  })
})
