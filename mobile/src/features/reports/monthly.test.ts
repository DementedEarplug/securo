import type { Report } from '@/api/types'
import { cumulativeDaily, dayLabels, knownBalances, monthWindow, nextMonth, onPace, previousMonth } from './monthly'

const today = new Date(2026, 9, 9) // Oct 9, 2026

describe('month vs last', () => {
  it('knows how much of the month has happened', () => {
    expect(monthWindow('2026-10', today)).toEqual({
      month: '2026-10',
      full: { from: '2026-10-01', to: '2026-10-31' },
      elapsed: { from: '2026-10-01', to: '2026-10-09' },
      days: 31,
      cutoffDay: 9,
      isCurrent: true,
    })
    expect(monthWindow('2026-02', today)).toMatchObject({ days: 28, cutoffDay: 28, isCurrent: false })
  })

  it('moves between months but never into the future', () => {
    expect(previousMonth('2026-01')).toBe('2025-12')
    expect(nextMonth('2026-09', today)).toBe('2026-10')
    expect(nextMonth('2026-10', today)).toBeNull()
  })

  it('accumulates daily spending, counting missing days as zero', () => {
    const report = {
      trend: [
        { date: '2026-10-01', value: 0, breakdowns: { expenses: 10 } },
        { date: '2026-10-03', value: 0, breakdowns: { expenses: 5.5 } },
      ],
    } as unknown as Report
    expect(cumulativeDaily(report, { from: '2026-10-01', to: '2026-10-04' })).toEqual([10, 10, 15.5, 15.5])
  })

  it('stops balances at the first unknown day', () => {
    expect(knownBalances([{ day: 2, balance: 5 }, { day: 1, balance: 4 }, { day: 3, balance: null }, { day: 4, balance: 9 }])).toEqual([4, 5])
  })

  it('compares with the same day last month, or its last day when shorter', () => {
    expect(onPace([10, 20, 30], [5, 10, 40], 2)).toMatchObject({ current: 20, previous: 10, change: 10, percent: 100 })
    expect(onPace([1, 2, 3, 4], [5, 6], 4)).toMatchObject({ current: 4, previous: 6 })
    expect(onPace([], [1], 1)).toBeNull()
  })

  it('labels the day axis for the longer month', () => {
    expect(dayLabels(3, 5)).toEqual(['1', '2', '3', '4', '5'])
  })
})
