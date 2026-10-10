import {
  DEFAULT_FILTERS,
  defaultInterval,
  effectiveInterval,
  previousRange,
  reportQuery,
  resolveRange,
  validIntervals,
  type ReportFilters,
} from './filters'

// Friday, Oct 9 2026 (local time).
const today = new Date(2026, 9, 9)
const f = (over: Partial<ReportFilters>): ReportFilters => ({ ...DEFAULT_FILTERS, ...over })

describe('resolveRange', () => {
  it.each([
    ['thisMonth', '2026-10-01', '2026-10-09'],
    ['lastMonth', '2026-09-01', '2026-09-30'],
    ['last3Months', '2026-08-01', '2026-10-09'],
    ['last6Months', '2026-05-01', '2026-10-09'],
    ['last12Months', '2025-11-01', '2026-10-09'],
    ['ytd', '2026-01-01', '2026-10-09'],
    ['lastYear', '2025-01-01', '2025-12-31'],
  ] as const)('%s', (preset, from, to) => {
    expect(resolveRange(f({ preset }), today)).toEqual({ from, to })
  })

  it('puts a custom range in order and never past today', () => {
    expect(resolveRange(f({ preset: 'custom', custom: { from: '2026-12-01', to: '2026-03-01' } }), today)).toEqual({
      from: '2026-03-01',
      to: '2026-10-09',
    })
  })

  it('keeps a custom range within ten years', () => {
    expect(resolveRange(f({ preset: 'custom', custom: { from: '2001-01-01', to: '2026-01-31' } }), today).from).toBe('2016-01-31')
  })

  it('falls back to six months when the custom dates are missing', () => {
    expect(resolveRange(f({ preset: 'custom', custom: { from: '', to: '' } }), today)).toEqual({ from: '2026-05-01', to: '2026-10-09' })
  })
})

describe('previousRange', () => {
  it('compares month-to-date with the same days of last month', () => {
    expect(previousRange({ from: '2026-10-01', to: '2026-10-09' }, 'previous')).toEqual({ from: '2026-09-01', to: '2026-09-09' })
  })

  it('keeps a whole month whole', () => {
    expect(previousRange({ from: '2026-09-01', to: '2026-09-30' }, 'previous')).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    expect(previousRange({ from: '2026-03-01', to: '2026-03-31' }, 'previous')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('moves a multi-month range back by its number of months', () => {
    expect(previousRange({ from: '2026-08-01', to: '2026-10-09' }, 'previous')).toEqual({ from: '2026-05-01', to: '2026-07-09' })
  })

  it('moves any other range back by its length in days', () => {
    expect(previousRange({ from: '2026-10-05', to: '2026-10-09' }, 'previous')).toEqual({ from: '2026-09-30', to: '2026-10-04' })
  })

  it('takes the same dates a year earlier', () => {
    expect(previousRange({ from: '2026-10-01', to: '2026-10-09' }, 'lastYear')).toEqual({ from: '2025-10-01', to: '2025-10-09' })
    expect(previousRange({ from: '2028-02-01', to: '2028-02-29' }, 'lastYear')).toEqual({ from: '2027-02-01', to: '2027-02-28' })
  })
})

describe('intervals', () => {
  it('picks a readable default for the range length', () => {
    expect(defaultInterval({ from: '2026-10-01', to: '2026-10-09' })).toBe('daily')
    expect(defaultInterval({ from: '2026-08-01', to: '2026-10-09' })).toBe('weekly')
    expect(defaultInterval({ from: '2025-11-01', to: '2026-10-09' })).toBe('monthly')
    expect(defaultInterval({ from: '2016-01-01', to: '2026-10-09' })).toBe('yearly')
  })

  it('offers only intervals that suit the range', () => {
    expect(validIntervals({ from: '2026-10-01', to: '2026-10-09' })).toEqual(['daily'])
    expect(validIntervals({ from: '2026-08-01', to: '2026-10-09' })).toEqual(['daily', 'weekly', 'monthly'])
    expect(validIntervals({ from: '2025-01-01', to: '2025-12-31' })).toEqual(['weekly', 'monthly', 'yearly'])
  })

  it('falls back to the default when the chosen interval does not suit the range', () => {
    expect(effectiveInterval(f({ preset: 'thisMonth', interval: 'yearly' }), { from: '2026-10-01', to: '2026-10-09' })).toBe('daily')
    expect(effectiveInterval(f({ interval: 'weekly' }), { from: '2026-05-01', to: '2026-10-09' })).toBe('weekly')
  })
})

describe('reportQuery', () => {
  it('sends explicit dates, the interval and the accounts', () => {
    expect(reportQuery(f({ preset: 'lastMonth', interval: 'weekly', accountIds: ['a1'] }), today)).toEqual({
      start_date: '2026-09-01',
      end_date: '2026-09-30',
      interval: 'weekly',
      account_ids: ['a1'],
    })
  })

  it('leaves accounts out when every account is included', () => {
    expect(reportQuery(f({ preset: 'thisMonth' }), today)).not.toHaveProperty('account_ids')
  })
})
