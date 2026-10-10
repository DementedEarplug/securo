import type { BudgetVsActual } from '@/api/types'

export interface BudgetSection {
  title: string | null
  items: BudgetVsActual[]
}

export interface BudgetSummary {
  budgeted: number
  spent: number
  /** Spending in categories without a budget this month. */
  unbudgeted: number
  sections: BudgetSection[]
}

/** Budgeted categories grouped by category group, plus month totals. */
export function summarizeBudgets(items: BudgetVsActual[]): BudgetSummary {
  const budgeted = items.filter((item) => item.budget_amount != null && Number(item.budget_amount) > 0)
  const unbudgeted = items
    .filter((item) => !budgeted.includes(item))
    .reduce((sum, item) => sum + Math.abs(Number(item.actual_amount)), 0)

  const groups = new Map<string | null, BudgetVsActual[]>()
  for (const item of budgeted) {
    const key = item.group_name ?? null
    groups.set(key, [...(groups.get(key) ?? []), item])
  }

  return {
    budgeted: budgeted.reduce((sum, item) => sum + Number(item.budget_amount), 0),
    spent: budgeted.reduce((sum, item) => sum + Math.abs(Number(item.actual_amount)), 0),
    unbudgeted,
    sections: [...groups.entries()].map(([title, sectionItems]) => ({ title, items: sectionItems })),
  }
}

/** Fraction of the budget used (0.5 = half); 0 when there is no budget. */
export function usedFraction(item: BudgetVsActual): number {
  const budget = Number(item.budget_amount ?? 0)
  return budget > 0 ? Math.abs(Number(item.actual_amount)) / budget : 0
}
