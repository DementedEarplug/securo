import {
  dailySpending,
  groupByDate,
  heatLevel,
  monthGrid,
  monthlyEquivalent,
  monthOccurrences,
  monthRange,
  recurringTotals,
  shiftCalendarMonth,
  spendingRange,
  subscriptions,
  type PaidRecurring,
  type ProjectedTransaction,
  type RecurringRead,
} from './calendar'
import { cellAmount } from './views/SpendingCalendar'

describe('month helpers', () => {
  it('lays a month out in Sunday-first weeks with padding', () => {
    // October 2026 starts on a Thursday and has 31 days.
    const weeks = monthGrid('2026-10')
    expect(weeks).toHaveLength(5)
    expect(weeks[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03'])
    expect(weeks[4]!.slice(0, 7)).toEqual(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'])
    expect(weeks.every((w) => w.length === 7)).toBe(true)
  })

  it('can start weeks on Monday', () => {
    expect(monthGrid('2026-10', 1)[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  })

  it('moves between months across years, and gives the month as a range', () => {
    expect(shiftCalendarMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftCalendarMonth('2026-01', -1)).toBe('2025-12')
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  it('asks for spending only up to today', () => {
    const october = monthRange('2026-10')
    expect(spendingRange(october, '2026-10-09')).toEqual({ from: '2026-10-01', to: '2026-10-09' })
    expect(spendingRange(october, '2026-12-01')).toEqual(october)
    expect(spendingRange(october, '2026-09-30')).toBeNull()
  })
})

describe('spending heat', () => {
  it('reads daily expenses from a report and skips empty days', () => {
    const map = dailySpending({
      trend: [
        { date: '2026-10-01', value: -20, breakdowns: { income: 0, expenses: 20 } },
        { date: '2026-10-02', value: 0, breakdowns: { income: 0, expenses: 0 } },
      ],
    } as never)
    expect([...map.entries()]).toEqual([['2026-10-01', 20]])
  })

  it('scales days against the month maximum, keeping small days visible', () => {
    expect(heatLevel(0, 100)).toBe(0)
    expect(heatLevel(5, 0)).toBe(0)
    expect(heatLevel(100, 100)).toBe(4)
    // A $15 coffee next to a $1,500 rent still gets a shade.
    expect(heatLevel(15, 1500)).toBe(1)
    expect(heatLevel(400, 1500)).toBe(3)
  })

  it('writes compact cell amounts', () => {
    expect(cellAmount(15.49)).toBe('15')
    expect(cellAmount(1200)).toBe('1.2k')
    expect(cellAmount(2000)).toBe('2k')
    expect(cellAmount(15000)).toBe('15k')
  })
})

describe('recurring', () => {
  const projected = (over: Partial<ProjectedTransaction>): ProjectedTransaction => ({
    recurring_id: 'r1',
    description: 'Netflix',
    amount: 15.49,
    currency: 'USD',
    type: 'debit',
    date: '2026-10-20',
    category_id: null,
    category_name: null,
    category_icon: null,
    ...over,
  })
  const booked = (over: Partial<PaidRecurring>): PaidRecurring =>
    ({
      id: 't1',
      recurring_transaction_id: 'r2',
      description: 'Rent',
      date: '2026-10-01',
      amount: '1500.00',
      amount_primary: null,
      currency: 'USD',
      type: 'debit',
      category: null,
      ...over,
    }) as PaidRecurring

  it('merges projections and booked rows, marking each paid, due or upcoming', () => {
    const items = monthOccurrences(
      [projected({}), projected({ recurring_id: 'r3', description: 'Gym', date: '2026-10-05', amount: 40 })],
      [booked({}), booked({ id: 't2', recurring_transaction_id: null, description: 'Coffee' })],
      '2026-10-09',
    )
    expect(items.map((i) => [i.description, i.status])).toEqual([
      ['Rent', 'paid'],
      ['Gym', 'due'],
      ['Netflix', 'upcoming'],
    ])
    expect(items[0]!.amount).toBe(1500)
  })

  it('totals what the month commits, keeping income apart', () => {
    const items = monthOccurrences(
      [projected({}), projected({ recurring_id: 'r4', description: 'Salary', type: 'credit', amount: 3000, date: '2026-10-15' })],
      [booked({})],
      '2026-10-09',
    )
    expect(recurringTotals(items)).toEqual({ paid: 1500, due: 0, upcoming: 15.49, committed: 1515.49, income: 3000 })
  })

  it('groups a day by amount, largest first', () => {
    const map = groupByDate([
      { date: '2026-10-01', amount: 5 },
      { date: '2026-10-01', amount: 50 },
      { date: '2026-10-02', amount: 1 },
    ])
    expect(map.get('2026-10-01')!.map((i) => i.amount)).toEqual([50, 5])
  })

  it('turns any frequency into a monthly cost', () => {
    expect(monthlyEquivalent(1200, 'weekly')).toBe(5200)
    expect(monthlyEquivalent(1200, 'biweekly')).toBe(2600)
    expect(monthlyEquivalent(15.49, 'monthly')).toBe(15.49)
    expect(monthlyEquivalent(100, 'quarterly')).toBe(33.33)
    expect(monthlyEquivalent(120, 'yearly')).toBe(10)
  })

  it('lists active recurring expenses by monthly cost, honouring the account filter', () => {
    const rule = (over: Partial<RecurringRead>): RecurringRead =>
      ({
        id: 'r',
        description: 'x',
        amount: '10',
        amount_primary: null,
        currency: 'USD',
        type: 'debit',
        frequency: 'monthly',
        is_active: true,
        account_id: 'a1',
        next_occurrence: '2026-10-20',
        ...over,
      }) as RecurringRead
    const result = subscriptions(
      [
        rule({ id: 'netflix', description: 'Netflix', amount: '15.49' }),
        rule({ id: 'domain', description: 'Domain', amount: '120', frequency: 'yearly' }),
        rule({ id: 'salary', description: 'Salary', type: 'credit', amount: '3000' }),
        rule({ id: 'old', description: 'Old gym', is_active: false }),
        rule({ id: 'other', description: 'Other card', account_id: 'a2', amount: '99' }),
      ],
      ['a1'],
    )
    expect(result.items.map((s) => [s.id, s.monthly])).toEqual([
      ['netflix', 15.49],
      ['domain', 10],
    ])
    expect(result.monthly).toBe(25.49)
  })
})
