import type { Transaction } from '@/api/types'
import {
  emptyFormValues,
  formValuesFrom,
  isInstallmentSeries,
  lockedFields,
  offersSimilar,
  toCreatePayload,
  toUpdatePayload,
  transactionFormSchema,
} from './form'

const tx = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: 'tx-1',
    description: 'Coffee',
    amount: '4.50',
    type: 'debit',
    date: '2026-10-01',
    account_id: 'acc-1',
    category_id: 'cat-1',
    notes: null,
    source: 'manual',
    user_id: 'u',
    ...overrides,
  }) as Transaction

describe('transactionFormSchema', () => {
  const schema = transactionFormSchema('pt-BR')

  it('accepts amounts in the display locale', () => {
    const result = schema.safeParse({ ...emptyFormValues('acc-1'), description: 'Café', amount: '1.234,50' })
    expect(result.success).toBe(true)
  })

  it('rejects a zero amount and a missing account with translatable messages', () => {
    const result = schema.safeParse({ ...emptyFormValues(''), description: 'x', amount: '0' })
    expect(result.success).toBe(false)
    const messages = result.error!.issues.map((issue) => issue.message)
    expect(messages).toEqual(
      expect.arrayContaining(['transactions.form.amountInvalid', 'transactions.form.accountRequired']),
    )
  })
})

describe('toCreatePayload', () => {
  it('sends a decimal string and trims text', () => {
    const payload = toCreatePayload(
      { ...emptyFormValues('acc-1'), description: '  Market ', amount: '1.234,50', notes: ' ' },
      'pt-BR',
    )
    expect(payload).toMatchObject({ description: 'Market', amount: '1234.5', account_id: 'acc-1', notes: null })
  })
})

describe('toUpdatePayload', () => {
  it('sends only what changed', () => {
    const original = tx()
    const values = { ...formValuesFrom(original, 'en-US'), categoryId: 'cat-2' }

    expect(toUpdatePayload(values, original, 'en-US')).toEqual({ category_id: 'cat-2' })
  })

  it('is empty when nothing changed', () => {
    const original = tx()
    expect(toUpdatePayload(formValuesFrom(original, 'en-US'), original, 'en-US')).toEqual({})
  })

  it('lets a transfer leg change its amount and date but not its account or direction', () => {
    const original = tx({ transfer_pair_id: 'pair' })
    const values = { ...formValuesFrom(original, 'en-US'), amount: '9', date: '2026-01-01', accountId: 'acc-2', type: 'credit' as const }

    expect(toUpdatePayload(values, original, 'en-US')).toEqual({ amount: '9', date: '2026-01-01' })
  })

  it('lets a split transaction change its amount, like the web', () => {
    const original = tx({ splits: [{ group_member_id: 'm' }] as Transaction['splits'] })
    const values = { ...formValuesFrom(original, 'en-US'), amount: '99', description: 'Dinner' }

    expect(lockedFields(original).size).toBe(0)
    expect(toUpdatePayload(values, original, 'en-US')).toEqual({ amount: '99', description: 'Dinner' })
  })
})

describe('isInstallmentSeries', () => {
  it('is true for a row in a plan of several installments', () => {
    expect(isInstallmentSeries(tx({ installment_series_id: 's', total_installments: 12 }))).toBe(true)
    expect(isInstallmentSeries(tx({ installment_series_id: 's', total_installments: 1 }))).toBe(false)
    expect(isInstallmentSeries(tx())).toBe(false)
  })
})

describe('offersSimilar', () => {
  it('offers when a plain transaction moves to a category', () => {
    expect(offersSimilar({ transfer_pair_id: null, is_shared: false }, 'c1')).toBe(true)
  })

  it('does not offer when the category was cleared or left unchanged', () => {
    expect(offersSimilar({ transfer_pair_id: null, is_shared: false }, null)).toBe(false)
    expect(offersSimilar({ transfer_pair_id: null, is_shared: false }, undefined)).toBe(false)
  })

  it('does not offer for transfers or transactions shared from a split group', () => {
    expect(offersSimilar({ transfer_pair_id: 't', is_shared: false }, 'c1')).toBe(false)
    expect(offersSimilar({ transfer_pair_id: null, is_shared: true }, 'c1')).toBe(false)
  })
})
