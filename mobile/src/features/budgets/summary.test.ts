import type { BudgetVsActual } from '@/api/types'
import { summarizeBudgets, usedFraction } from './summary'

const item = (name: string, budget: string | null, actual: string, group: string | null = 'Home') =>
  ({
    category_id: name,
    category_name: name,
    category_color: '#000',
    category_icon: 'x',
    budget_amount: budget,
    actual_amount: actual,
    group_name: group,
  }) as BudgetVsActual

describe('summarizeBudgets', () => {
  it('totals budgeted categories and separates unbudgeted spending', () => {
    const summary = summarizeBudgets([
      item('Rent', '1000', '-1000'),
      item('Food', '400', '-250', 'Living'),
      item('Gifts', null, '-80'),
    ])

    expect(summary).toMatchObject({ budgeted: 1400, spent: 1250, unbudgeted: 80 })
    expect(summary.sections.map((s) => s.title)).toEqual(['Home', 'Living'])
  })
})

describe('usedFraction', () => {
  it('compares spending to the budget', () => {
    expect(usedFraction(item('Food', '400', '-500'))).toBeCloseTo(1.25)
    expect(usedFraction(item('Food', null, '-500'))).toBe(0)
  })
})
