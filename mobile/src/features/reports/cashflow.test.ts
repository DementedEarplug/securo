import type { Report } from '@/api/types'
import {
  cashFlowPoints,
  cashFlowTotals,
  flowBuckets,
  flowSummary,
  lowestProjected,
  projectedAmount,
  savingsRate,
  todayIndex,
  upcomingFlows,
  type ProjectedTransaction,
} from './cashflow'

function incomeReport(income: number, expenses: number, trend: Report['trend'] = []): Report {
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
    meta: { type: 'income_expenses', series_keys: [], currency: 'USD', interval: 'monthly', baseline_active: false },
    composition: [],
    category_trend: [],
  } as Report
}

const point = (date: string, value: number, breakdowns: Record<string, number>) =>
  ({ date, value, breakdowns, composition: [] }) as unknown as Report['trend'][number]

describe('savingsRate', () => {
  it('is the share of income kept, rounded to a tenth', () => {
    expect(savingsRate(4000, 3000)).toBe(25)
    expect(savingsRate(3000, 1999)).toBe(33.4)
  })

  it('goes negative when spending exceeds income', () => {
    expect(savingsRate(1000, 1500)).toBe(-50)
  })

  it('is null without income', () => {
    expect(savingsRate(0, 500)).toBeNull()
    expect(savingsRate(-10, 0)).toBeNull()
  })
})

describe('flowBuckets', () => {
  it('turns trend breakdowns into income, expenses, net and rate per bucket', () => {
    const report = incomeReport(0, 0, [
      point('2026-08', 0, { income: 3000, expenses: 1200 }),
      point('2026-09', 0, { income: 0, expenses: 300 }),
    ])
    expect(flowBuckets(report)).toEqual([
      { date: '2026-08', income: 3000, expenses: 1200, net: 1800, savingsRate: 60 },
      { date: '2026-09', income: 0, expenses: 300, net: -300, savingsRate: null },
    ])
  })

  it('leaves out forecast buckets', () => {
    const report = incomeReport(0, 0, [point('2026-09', 0, { income: 1 }), point('2026-10', 0, { income: 2 })])
    report.meta.forecast_start_date = '2026-10'
    expect(flowBuckets(report).map((b) => b.date)).toEqual(['2026-09'])
  })
})

describe('flowSummary', () => {
  it('compares totals and the savings rate with the previous period', () => {
    const summary = flowSummary(incomeReport(5000, 3000), incomeReport(4000, 3600))
    expect(summary.income).toMatchObject({ current: 5000, previous: 4000, change: 1000, percent: 25 })
    expect(summary.expenses).toMatchObject({ current: 3000, previous: 3600, change: -600 })
    expect(summary.net).toMatchObject({ current: 2000, previous: 400, change: 1600 })
    expect(summary.savingsRate).toEqual({ current: 40, previous: 10, points: 30 })
  })

  it('has no rate change while the previous period is loading or had no income', () => {
    expect(flowSummary(incomeReport(5000, 3000)).savingsRate).toEqual({ current: 40, previous: null, points: null })
    expect(flowSummary(incomeReport(5000, 3000), incomeReport(0, 10)).savingsRate.points).toBeNull()
  })
})

function cashFlowReport(): Report {
  return {
    summary: {
      primary_value: 900,
      change_amount: -100,
      change_percent: -10,
      breakdowns: [
        { key: 'startingBalance', label: '', value: 1000, color: '' },
        { key: 'projectedIncome', label: '', value: 300, color: '' },
        { key: 'projectedExpenses', label: '', value: 400, color: '' },
        { key: 'endingBalance', label: '', value: 900, color: '' },
      ],
    },
    trend: [
      point('2026-10-08', 950, { inflow: 0, outflow: 20 }),
      point('2026-10-09', 1000, { inflow: 70, outflow: 20 }),
      point('2026-10-10', 700, { inflow: 0, outflow: 300 }),
      point('2026-10-11', 900, { inflow: 300, outflow: 100 }),
    ],
    meta: {
      type: 'cash_flow',
      series_keys: ['balance'],
      currency: 'USD',
      interval: 'daily',
      forecast_start_date: '2026-10-09',
      baseline_active: false,
    },
    composition: [],
    category_trend: [],
  } as Report
}

describe('cash flow', () => {
  it('marks buckets after today as forecast, keeping today actual', () => {
    const points = cashFlowPoints(cashFlowReport())
    expect(points.map((p) => p.forecast)).toEqual([false, false, true, true])
    expect(points[2]).toEqual({ date: '2026-10-10', balance: 700, inflow: 0, outflow: 300, forecast: true })
    expect(todayIndex(points)).toBe(1)
  })

  it('has no today marker without a forecast', () => {
    const report = cashFlowReport()
    report.meta.forecast_start_date = null
    expect(todayIndex(cashFlowPoints(report))).toBeNull()
  })

  it('reads the server summary', () => {
    expect(cashFlowTotals(cashFlowReport())).toEqual({
      starting: 1000,
      projectedIncome: 300,
      projectedExpenses: 400,
      ending: 900,
      change: -100,
      changePercent: -10,
    })
  })

  it('finds the lowest projected balance, ignoring the past', () => {
    expect(lowestProjected(cashFlowPoints(cashFlowReport()))?.date).toBe('2026-10-10')
  })
})

const projected = (over: Partial<ProjectedTransaction>): ProjectedTransaction => ({
  account_id: 'acc1',
  amount: 10,
  amount_primary: null,
  category_color: null,
  category_icon: null,
  category_id: null,
  category_name: null,
  currency: 'USD',
  date: '2026-10-15',
  description: 'Netflix',
  recurring_id: 'r1',
  type: 'debit',
  ...over,
})

describe('upcoming recurring transactions', () => {
  it('signs money in positive and out negative, preferring the primary-currency amount', () => {
    expect(projectedAmount(projected({ amount: 15 }))).toBe(-15)
    expect(projectedAmount(projected({ type: 'credit', amount: 100, amount_primary: 520 }))).toBe(520)
  })

  it('keeps the chosen accounts, soonest first, then largest', () => {
    const items = [
      projected({ description: 'late', date: '2026-10-20' }),
      projected({ description: 'small', date: '2026-10-12', amount: 5 }),
      projected({ description: 'big', date: '2026-10-12', amount: 900 }),
      projected({ description: 'other account', account_id: 'acc2', date: '2026-10-11' }),
      projected({ description: 'no account', account_id: null, date: '2026-10-11' }),
    ]
    expect(upcomingFlows(items, ['acc1']).map((i) => i.description)).toEqual(['big', 'small', 'late'])
    expect(upcomingFlows(items, []).map((i) => i.description)).toHaveLength(5)
  })
})
