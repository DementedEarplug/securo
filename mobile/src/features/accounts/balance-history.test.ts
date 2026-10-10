import { alignSign, cycleBounds, downsample, historyRange } from './balance-history'

const today = new Date(2026, 9, 9) // Oct 9, 2026

describe('account balance history', () => {
  it('turns a range into dates ending today', () => {
    expect(historyRange('1M', today)).toEqual({ from: '2026-09-10', to: '2026-10-09' })
    expect(historyRange('1Y', today)).toEqual({ from: '2025-10-10', to: '2026-10-09' })
    expect(historyRange('all', today, '2024-03-15')).toEqual({ from: '2024-03-14', to: '2026-10-09' })
    expect(historyRange('all', today, null)).toEqual({ from: '2025-10-10', to: '2026-10-09' })
  })

  it('matches the chart sign to the balance shown in the header', () => {
    const points = [{ date: 'a', balance: -10 }, { date: 'b', balance: -20, balance_primary: -4 }]
    expect(alignSign(points, 20).map((p) => p.balance)).toEqual([10, 20])
    expect(alignSign(points, 20)[1]!.balance_primary).toBe(4)
    expect(alignSign(points, -20)).toBe(points)
    expect(alignSign(points, 0)).toBe(points)
  })

  it('thins long series but keeps both ends', () => {
    const points = Array.from({ length: 365 }, (_, i) => i)
    const thin = downsample(points, 60)
    expect(thin).toHaveLength(60)
    expect(thin[0]).toBe(0)
    expect(thin.at(-1)).toBe(364)
    expect(downsample([1, 2], 60)).toEqual([1, 2])
  })

  it('finds the billing cycle like the web account page', () => {
    // Closes on the 5th: Oct 9 is in the Oct 5 – Nov 4 cycle.
    expect(cycleBounds(5, today)).toEqual({ from: '2026-10-05', to: '2026-11-04' })
    // Closes on the 20th: Oct 9 is in the Sep 20 – Oct 19 cycle.
    expect(cycleBounds(20, today)).toEqual({ from: '2026-09-20', to: '2026-10-19' })
    // The close day itself opens a new cycle; day 31 clamps to short months.
    expect(cycleBounds(31, new Date(2026, 1, 28))).toEqual({ from: '2026-02-28', to: '2026-03-30' })
    expect(cycleBounds(null, today)).toEqual({ from: '2026-09-01', to: '2026-10-09' })
  })
})
