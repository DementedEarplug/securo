import { en, ptBR } from './locales'

function keys(value: unknown, prefix = ''): string[] {
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
  }
  return [prefix]
}

describe('locales', () => {
  // CONTRIBUTING: user-facing strings ship in EN and PT-BR together.
  it('pt-BR has exactly the English keys', () => {
    expect(keys(ptBR).sort()).toEqual(keys(en).sort())
  })

  it('has no empty strings', () => {
    for (const [name, bundle] of Object.entries({ en, ptBR })) {
      const empty = keys(bundle).filter((key) => key.split('.').reduce<any>((o, k) => o[k], bundle) === '')
      expect({ name, empty }).toEqual({ name, empty: [] })
    }
  })
})
