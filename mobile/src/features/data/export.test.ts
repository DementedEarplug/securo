import { backupBody, checkBackupPassword, csvExportPath, periodRange } from './export'

describe('periodRange', () => {
  const today = new Date(2026, 9, 9) // 9 Oct 2026
  const custom = { from: '2026-01-15', to: '2026-02-20' }

  it('exports everything without dates', () => {
    expect(periodRange('all', today, custom)).toEqual({})
  })

  it('covers whole calendar periods', () => {
    expect(periodRange('thisMonth', today, custom)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(periodRange('lastMonth', today, custom)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(periodRange('thisYear', today, custom)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })

  it('handles last month across a year boundary', () => {
    expect(periodRange('lastMonth', new Date(2026, 0, 31), custom)).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })

  it('uses the custom range, swapping a reversed one', () => {
    expect(periodRange('custom', today, custom)).toEqual(custom)
    expect(periodRange('custom', today, { from: '2026-03-01', to: '2026-02-01' })).toEqual({ from: '2026-02-01', to: '2026-03-01' })
  })
})

describe('csvExportPath', () => {
  it('has no query when nothing is filtered', () => {
    expect(csvExportPath({ accountIds: [], excludeIgnored: false })).toBe('/api/transactions/export')
  })

  it('repeats account ids and uses the from/to aliases', () => {
    expect(csvExportPath({ from: '2026-10-01', to: '2026-10-31', accountIds: ['a', 'b'], excludeIgnored: true })).toBe(
      '/api/transactions/export?from=2026-10-01&to=2026-10-31&account_ids=a&account_ids=b&exclude_ignored=true',
    )
  })
})

describe('backup password', () => {
  it('is optional', () => {
    expect(checkBackupPassword('', '')).toBeNull()
    expect(backupBody('')).toBe('{}')
  })

  it('needs eight characters typed twice', () => {
    expect(checkBackupPassword('short', 'short')).toBe('data.backup.passwordTooShort')
    expect(checkBackupPassword('long enough', 'long enougH')).toBe('data.backup.passwordMismatch')
    expect(checkBackupPassword('long enough', 'long enough')).toBeNull()
    expect(backupBody('long enough')).toBe('{"password":"long enough"}')
  })
})
