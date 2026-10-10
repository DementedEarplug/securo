import AsyncStorage from '@react-native-async-storage/async-storage'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'

import { apiFetch } from '@/api/client'
import { renderWithProviders } from '@/test/render'
import { ProposalCard } from './ProposalCard'

jest.mock('@/api/client', () => ({ ...jest.requireActual('@/api/client'), apiFetch: jest.fn() }))

const goal = {
  kind: 'create_goal' as const,
  proposed: { name: 'Trip', target_amount: 5000, currency: 'USD', deadline: '2027-06-01', initial_amount: 0 },
}

function seed(role: string): [unknown[], unknown][] {
  return [
    [['me'], { id: 'u', email: 'me@example.com', preferences: { currency_display: 'USD', language: 'en' } }],
    [['settings', 'number-format'], { format: 'comma_dot' }],
    [['settings', 'date-format'], { format: 'mdy' }],
    [['workspaces', 'current', 'default'], { id: 'w', name: 'Personal', role }],
    [['agent-proposals-applied'], {}],
  ]
}

describe('ProposalCard', () => {
  beforeEach(async () => {
    jest.mocked(apiFetch).mockReset()
    await AsyncStorage.clear()
  })

  it('applies a proposal through the API and remembers it', async () => {
    jest.mocked(apiFetch).mockResolvedValue(new Response(null, { status: 204 }))
    await renderWithProviders(<ProposalCard toolCallId="call-1" data={goal} />, seed('owner'))

    expect(screen.getByText('Create goal')).toBeOnTheScreen()
    expect(screen.getByText(/“Trip”, target \$5,000\.00, deadline 2027-06-01/)).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(screen.getByText('APPLIED')).toBeOnTheScreen())
    expect(jest.mocked(apiFetch).mock.calls[0]![0]).toBe('/api/goals')
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull()
    expect(JSON.parse((await AsyncStorage.getItem('securo:agent-proposal-applied')) ?? '{}')).toHaveProperty('call-1')
  })

  it('does not offer Apply to read-only members', async () => {
    await renderWithProviders(<ProposalCard toolCallId="call-2" data={goal} />, seed('viewer'))
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull()
    expect(screen.getByText("Read-only members can't apply proposals.")).toBeOnTheScreen()
  })

  it('shows a failed proposal as an error', async () => {
    await renderWithProviders(<ProposalCard toolCallId="call-3" data={{ error: 'Unknown account' }} />, seed('owner'))
    expect(screen.getByText('Unknown account')).toBeOnTheScreen()
  })
})
