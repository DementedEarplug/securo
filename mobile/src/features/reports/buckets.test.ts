import { bucketLabel, bucketRange, formatRange } from './buckets'

describe('bucketRange', () => {
  it('reads each interval label', () => {
    expect(bucketRange('2026-10-07')).toEqual({ from: '2026-10-07', to: '2026-10-07' })
    expect(bucketRange('2026-W41')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(bucketRange('2027-W01')).toEqual({ from: '2027-01-04', to: '2027-01-10' })
    expect(bucketRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(bucketRange('2025')).toEqual({ from: '2025-01-01', to: '2025-12-31' })
  })

  it('clamps the partial first and last buckets to the report range', () => {
    const within = { from: '2026-05-01', to: '2026-10-09' }
    expect(bucketRange('2026-10', within)).toEqual({ from: '2026-10-01', to: '2026-10-09' })
    expect(bucketRange('2026-W18', within)).toEqual({ from: '2026-05-01', to: '2026-05-03' })
  })
})

describe('labels', () => {
  it('formats axis labels per interval', () => {
    expect(bucketLabel('2026-10', 'monthly', 'en-US')).toBe('Oct')
    expect(bucketLabel('2026', 'yearly', 'en-US')).toBe('2026')
    expect(bucketLabel('2026-W41', 'weekly', 'en-US')).toBe('Oct 5')
  })

  it('formats a range compactly within one year', () => {
    expect(formatRange({ from: '2026-10-01', to: '2026-10-09' }, 'en-US')).toBe('Oct 1 – Oct 9, 2026')
    expect(formatRange({ from: '2025-11-01', to: '2026-10-09' }, 'en-US')).toBe('Nov 1, 2025 – Oct 9, 2026')
  })
})
