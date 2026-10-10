import { formatCurrency, parseAmountInput, resolveDateLocale, resolveDisplayLocale } from './format'

describe('resolveDisplayLocale', () => {
  it('uses the explicit admin format over the currency', () => {
    expect(resolveDisplayLocale('dot_comma', 'USD')).toBe('de-DE')
  })

  it('follows the currency on "auto"', () => {
    expect(resolveDisplayLocale('auto', 'BRL')).toBe('pt-BR')
    expect(resolveDisplayLocale('auto', 'XYZ', 'en-US')).toBe('en-US')
  })
})

describe('resolveDateLocale', () => {
  it('keeps an English UI but honours a day-first order', () => {
    expect(resolveDateLocale('dmy', 'comma_dot', 'USD', 'en')).toBe('en-GB')
  })
})

describe('formatCurrency', () => {
  it('formats with the locale separators', () => {
    expect(formatCurrency(1234.5, 'USD', 'en-US')).toBe('$1,234.50')
  })

  it('never renders a negative zero', () => {
    expect(formatCurrency(-0.001, 'USD', 'en-US')).toBe('$0.00')
  })

  it('shows a dash for a missing value', () => {
    expect(formatCurrency(null)).toBe('—')
  })
})

describe('parseAmountInput', () => {
  it.each([
    ['1,234.56', 'en-US', 1234.56],
    ['1.234,56', 'de-DE', 1234.56],
    ['12', 'en-US', 12],
    ['0,5', 'pt-BR', 0.5],
  ])('reads %s in %s', (input, locale, expected) => {
    expect(parseAmountInput(input, locale)).toBeCloseTo(expected)
  })

  it('rejects text that is not a number', () => {
    expect(parseAmountInput('12a', 'en-US')).toBeNull()
    expect(parseAmountInput('', 'en-US')).toBeNull()
  })
})
