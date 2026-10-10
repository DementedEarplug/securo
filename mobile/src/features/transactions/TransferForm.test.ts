import { toTransferCreate, transferErrors, type TransferValues } from './TransferForm'

const values: TransferValues = {
  fromAccountId: 'chk',
  toAccountId: 'sav',
  amount: '1.000,50',
  destinationAmount: '',
  date: '2026-10-09',
  description: ' Savings ',
  notes: '',
}

describe('transfers', () => {
  it('sends the amount in the display locale and no destination amount for one currency', () => {
    expect(toTransferCreate(values, 'pt-BR', false)).toEqual({
      from_account_id: 'chk',
      to_account_id: 'sav',
      amount: '1000.5',
      date: '2026-10-09',
      description: 'Savings',
      notes: null,
    })
  })

  it('sends what arrived for a cross-currency transfer', () => {
    expect(toTransferCreate({ ...values, destinationAmount: '190,00' }, 'pt-BR', true)).toMatchObject({ destination_amount: '190' })
  })

  it('rejects moving money into the same account', () => {
    expect(transferErrors({ ...values, toAccountId: 'chk' }, 'pt-BR', false)).toEqual({ toAccountId: 'transactions.transfer.sameAccount' })
  })
})
