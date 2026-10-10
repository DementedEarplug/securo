import { fireEvent, screen, waitFor } from '@testing-library/react-native'

import { renderWithProviders } from '@/test/render'
import { emptyFormValues } from './form'
import { TransactionForm } from './TransactionForm'

const seed: [unknown[], unknown][] = [
  [['default', 'payees', ''], []],
  [['me'], { id: 'u', email: 'me@example.com', preferences: { currency_display: 'USD', language: 'en' } }],
  [['settings', 'number-format'], { format: 'comma_dot' }],
  [['settings', 'date-format'], { format: 'mdy' }],
  [['default', 'accounts', { includeClosed: false }], [{ id: 'acc-1', name: 'Checking', type: 'checking', balance: '0', is_closed: false, currency: 'USD' }]],
  [['default', 'category-groups'], [
    { id: 'g', name: 'Food', is_hidden: false, position: 0, categories: [{ id: 'cat-1', name: 'Groceries', is_hidden: false, color: '#0a0' }] },
  ]],
]

describe('TransactionForm', () => {
  it('shows translated errors instead of submitting an incomplete transaction', async () => {
    const onSubmit = jest.fn()
    await renderWithProviders(
      <TransactionForm defaultValues={emptyFormValues('')} onSubmit={onSubmit} submitLabel="Save" />,
      seed,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Enter a description.')).toBeOnTheScreen()
    expect(screen.getByText('Enter an amount greater than zero.')).toBeOnTheScreen()
    expect(screen.getByText('Choose an account.')).toBeOnTheScreen()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits what the user entered', async () => {
    const onSubmit = jest.fn(async (_values: unknown) => {})
    await renderWithProviders(
      <TransactionForm defaultValues={emptyFormValues('acc-1')} onSubmit={onSubmit} submitLabel="Save" />,
      seed,
    )

    await fireEvent.changeText(screen.getByLabelText('Amount'), '12.50')
    await fireEvent.changeText(screen.getByLabelText('Description'), 'Groceries run')
    await fireEvent.press(screen.getByRole('radio', { name: 'Income' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      amount: '12.50',
      description: 'Groceries run',
      type: 'credit',
      accountId: 'acc-1',
    })
  })

  it("locks the fields a linked transaction can't change here", async () => {
    await renderWithProviders(
      <TransactionForm
        defaultValues={emptyFormValues('acc-1')}
        onSubmit={jest.fn()}
        submitLabel="Save"
        locked={new Set(['amount', 'type', 'date', 'account'])}
        lockedNotice="Split with a group"
      />,
      seed,
    )

    expect(screen.getByText('Split with a group')).toBeOnTheScreen()
    expect(screen.queryByRole('radio', { name: 'Income' })).toBeNull()
    expect(screen.getByLabelText('Amount')).toHaveProp('editable', false)
  })
})
