import { formatMonth, shiftMonth } from './dates'

describe('formatMonth', () => {
  it('capitalizes only the first letter', () => {
    expect(formatMonth('2026-10', 'pt-BR')).toBe('Outubro de 2026')
    expect(formatMonth('2026-10', 'en')).toBe('October 2026')
  })
})

describe('shiftMonth', () => {
  it('crosses year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })
})
