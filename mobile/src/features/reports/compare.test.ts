import type { Report } from '@/api/types'
import { comparePeriods, delta } from './compare'

function report(income: number, expenses: number, composition: [string, string, number, string?][]): Report {
  return {
    summary: {
      primary_value: income - expenses,
      change_amount: 0,
      change_percent: null,
      breakdowns: [
        { key: 'income', label: 'Income', value: income, color: '' },
        { key: 'expenses', label: 'Expenses', value: expenses, color: '' },
      ],
    },
    trend: [],
    meta: { type: 'income_expenses', series_keys: [], currency: 'USD', interval: 'monthly', baseline_active: false },
    composition: composition.map(([key, label, value, group]) => ({ key, label, value, color: '#000', group: group ?? 'expenses' })),
    category_trend: [],
  } as Report
}

describe('delta', () => {
  it('has no percent when there is nothing to compare against', () => {
    expect(delta(50, 0)).toEqual({ current: 50, previous: 0, change: 50, percent: null })
    expect(delta(80, 100)).toEqual({ current: 80, previous: 100, change: -20, percent: -20 })
  })
})

describe('comparePeriods', () => {
  const now = report(3000, 1200, [
    ['food', 'Food', 500],
    ['rent', 'Rent', 700],
    ['salary', 'Salary', 3000, 'income'],
  ])
  const before = report(2800, 1000, [
    ['food', 'Food', 300],
    ['rent', 'Rent', 700],
    ['fun', 'Fun', 150],
  ])

  it('compares the totals and the net', () => {
    const result = comparePeriods(now, before, 'expenses')
    expect(result.income).toMatchObject({ current: 3000, previous: 2800, change: 200 })
    expect(result.expenses).toMatchObject({ current: 1200, previous: 1000, change: 200, percent: 20 })
    expect(result.net).toMatchObject({ current: 1800, previous: 1800, change: 0 })
  })

  it('lists every category of either period, biggest change first', () => {
    const rows = comparePeriods(now, before, 'expenses').categories
    expect(rows.map((r) => [r.key, r.change])).toEqual([
      ['food', 200],
      ['fun', -150],
      ['rent', 0],
    ])
    expect(rows[1]).toMatchObject({ current: 0, previous: 150, percent: -100 })
  })

  it('keeps income categories apart', () => {
    expect(comparePeriods(now, before, 'income').categories.map((r) => r.key)).toEqual(['salary'])
  })
})
