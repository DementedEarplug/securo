import type { Account } from '@/api/types'
import { accountFormSchema, accountValuesFrom, emptyAccountValues, toAccountCreate, toAccountUpdate } from './form'

const today = new Date(2026, 9, 9)

describe('account form', () => {
  it('creates a manual account with an opening balance', () => {
    const values = { ...emptyAccountValues('USD', today), name: ' Checking ', balance: '1,250.50' }
    expect(toAccountCreate(values, 'en-US')).toEqual({
      name: 'Checking',
      type: 'checking',
      currency: 'USD',
      balance: '1250.5',
      balance_date: '2026-10-09',
      credit_limit: null,
      statement_close_day: null,
      payment_due_day: null,
    })
  })

  it('sends card fields only for credit cards', () => {
    const values = {
      ...emptyAccountValues('BRL', today),
      name: 'Nubank',
      type: 'credit_card',
      balance: '300,00',
      creditLimit: '5.000,00',
      statementCloseDay: '5',
      paymentDueDay: '40',
    }
    expect(toAccountCreate(values, 'pt-BR')).toMatchObject({
      credit_limit: '5000',
      statement_close_day: 5,
      payment_due_day: null,
    })
    expect(accountFormSchema('pt-BR', { connected: false }).safeParse(values).success).toBe(false)
  })

  it('only updates what a bank-connected account allows', () => {
    const account = { id: 'a', name: 'BANK CHK 1234', type: 'checking', balance: '0', currency: 'USD', connection_id: 'c' } as Account
    const values = { ...accountValuesFrom(account, 'en-US', today), displayName: 'Everyday', type: 'savings' }
    expect(toAccountUpdate(values, 'en-US', { connected: true })).toEqual({
      display_name: 'Everyday',
      type: 'savings',
      credit_limit: null,
      statement_close_day: null,
      payment_due_day: null,
    })
  })

  it('requires a name for manual accounts only', () => {
    const blank = { ...emptyAccountValues('USD', today) }
    expect(accountFormSchema('en-US', { connected: false }).safeParse(blank).success).toBe(false)
    expect(accountFormSchema('en-US', { connected: true }).safeParse(blank).success).toBe(true)
  })
})
