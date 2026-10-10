import type { LucideIcon } from 'lucide-react-native'
import CalendarDays from 'lucide-react-native/icons/calendar-days'
import CalendarRange from 'lucide-react-native/icons/calendar-range'
import ChartColumn from 'lucide-react-native/icons/chart-column'
import ChartPie from 'lucide-react-native/icons/chart-pie'
import GitCompare from 'lucide-react-native/icons/git-compare'
import Landmark from 'lucide-react-native/icons/landmark'
import Store from 'lucide-react-native/icons/store'
import TrendingUp from 'lucide-react-native/icons/trending-up'
import ChartSpline from 'lucide-react-native/icons/chart-spline'
import type { ReactElement } from 'react'

import type { ReportFilters } from './filters'
import type { ReportControlSet } from './ReportControls'
import { CategoryTrends } from './views/CategoryTrends'
import { CashFlow } from './views/CashFlow'
import { IncomeExpenses } from './views/IncomeExpenses'
import { MonthVsLast } from './views/MonthVsLast'
import { NetWorthBreakdown } from './views/NetWorthBreakdown'
import { PeriodComparison } from './views/PeriodComparison'
import { SpendingByCategory } from './views/SpendingByCategory'
import { SpendingCalendar } from './views/SpendingCalendar'
import { TopPayees } from './views/TopPayees'

export interface ReportDefinition {
  key: string
  /** i18n key of the report's name in the picker. */
  titleKey: string
  icon: LucideIcon
  /** Which shared controls (range, interval, accounts) the report reads. */
  controls: ReportControlSet
  Component: (props: { filters: ReportFilters }) => ReactElement
}

const ALL: ReportControlSet = { range: true, interval: true, accounts: true }
const NO_INTERVAL: ReportControlSet = { range: true, interval: false, accounts: true }

/** Every report on the Reports tab, in picker order. Add a view with one entry here. */
export const REPORTS: ReportDefinition[] = [
  { key: 'spendingByCategory', titleKey: 'reports.views.spendingByCategory', icon: ChartPie, controls: NO_INTERVAL, Component: SpendingByCategory },
  { key: 'categoryTrends', titleKey: 'reports.views.categoryTrends', icon: TrendingUp, controls: ALL, Component: CategoryTrends },
  { key: 'periodComparison', titleKey: 'reports.views.periodComparison', icon: GitCompare, controls: NO_INTERVAL, Component: PeriodComparison },
  // Month navigation replaces the range control; the account filter still applies.
  { key: 'calendar', titleKey: 'reports.views.calendar', icon: CalendarDays, controls: { range: false, interval: false, accounts: true }, Component: SpendingCalendar },
  { key: 'topPayees', titleKey: 'reports.views.topPayees', icon: Store, controls: NO_INTERVAL, Component: TopPayees },
  { key: 'netWorth', titleKey: 'reports.views.netWorth', icon: Landmark, controls: ALL, Component: NetWorthBreakdown },
  // Month navigation replaces the range control; the account filter still applies.
  { key: 'monthVsLast', titleKey: 'reports.views.monthVsLast', icon: CalendarRange, controls: { range: false, interval: false, accounts: true }, Component: MonthVsLast },
  { key: 'incomeExpenses', titleKey: 'reports.views.incomeExpenses', icon: ChartColumn, controls: ALL, Component: IncomeExpenses },
  // A forward forecast: its own horizon and interval replace the range control; accounts still apply.
  { key: 'cashFlow', titleKey: 'reports.cashFlow.title', icon: ChartSpline, controls: { range: false, interval: false, accounts: true }, Component: CashFlow },
]

export function findReport(key: string | null): ReportDefinition {
  return REPORTS.find((r) => r.key === key) ?? REPORTS[0]!
}
