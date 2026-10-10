import { installmentCount, toInstallmentSeries, toRecurring } from './repeat'

const base = {
  description: 'Laptop',
  amount: '100',
  type: 'debit',
  date: '2026-10-09',
  account_id: 'acc-1',
  category_id: 'cat-1',
}

describe('installmentCount', () => {
  it.each([
    ['12', 12],
    ['2', 2],
    ['360', 360],
    ['1', null],
    ['361', null],
    ['2.5', null],
    ['', null],
  ])('%j → %j', (raw, expected) => {
    expect(installmentCount(raw)).toBe(expected)
  })
})

it('builds an installment plan from one installment', () => {
  expect(toInstallmentSeries(base, { kind: 'installments', count: '12', frequency: 'monthly' })).toEqual({
    base,
    installments: 12,
    frequency: 'monthly',
    first_installment_status: 'posted',
  })
})

it('builds the recurring entry that follows a new transaction', () => {
  expect(toRecurring(base, 'BRL', { kind: 'recurring', frequency: 'monthly', endDate: null })).toEqual({
    description: 'Laptop',
    amount: '100',
    currency: 'BRL',
    type: 'debit',
    frequency: 'monthly',
    start_date: '2026-10-09',
    end_date: null,
    category_id: 'cat-1',
    account_id: 'acc-1',
    skip_first: true,
  })
})
