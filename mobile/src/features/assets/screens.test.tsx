import { fireEvent, screen } from '@testing-library/react-native'

import AssetsScreen from '../../../app/(app)/assets/index'
import AssetTransactionScreen from '../../../app/(app)/assets/transaction'
import { renderWithProviders } from '@/test/render'

// Lucide ships untransformed ESM icons; the screens only need something to render.

const mockPush = jest.fn()
let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}))

const holding = {
  id: 'h1',
  user_id: 'u',
  name: 'Apple Inc.',
  ticker: 'AAPL',
  type: 'stock',
  currency: 'USD',
  valuation_method: 'market_price',
  is_archived: false,
  position: 0,
  source: 'manual',
  group_id: 'g1',
  units: 2,
  average_price: 100,
  total_invested: 200,
  current_value: 300,
  gain_loss: 100,
  value_count: 1,
  transaction_count: 1,
}

const seed: [unknown[], unknown][] = [
  [['me'], { id: 'u', email: 'me@example.com', preferences: { currency_display: 'USD', language: 'en' } }],
  [['settings', 'number-format'], { format: 'comma_dot' }],
  [['settings', 'date-format'], { format: 'mdy' }],
  [['workspaces', 'current', 'default'], { id: 'w', name: 'Personal', role: 'owner', enabled_modules: [] }],
  [['default', 'asset-groups'], [{ id: 'g1', user_id: 'u', name: 'US Stocks', color: '#3B82F6', position: 0, current_value: 300 }]],
  [
    ['default', 'assets', { includeArchived: false }],
    [
      holding,
      { ...holding, id: 'h2', name: 'Old car', ticker: null, type: 'vehicle', valuation_method: 'manual', group_id: null, sell_date: '2026-01-05', sell_price: 9000, purchase_price: 10000, realized_gain: -1000, total_invested: null },
    ],
  ],
  [['default', 'assets', 'portfolio-trend'], { assets: [], trend: [], total: 300 }],
]

beforeEach(() => {
  mockPush.mockClear()
  mockParams = {}
})

describe('assets screens', () => {
  it('lists holdings by wallet with their return, and opens one', async () => {
    await renderWithProviders(<AssetsScreen />, seed)

    expect(screen.getByText('US STOCKS')).toBeOnTheScreen()
    expect(screen.getByText('AAPL')).toBeOnTheScreen()
    expect(screen.getByText('+$100.00 (+50.00%)')).toBeOnTheScreen()
    expect(screen.getByText('Sold assets')).toBeOnTheScreen()
    expect(screen.getByText('-$1,000.00 (-10.00%)')).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: 'AAPL' }))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/assets/[id]', params: { id: 'h1' } })
  })

  it("won't sell more units than the holding has", async () => {
    mockParams = { assetId: 'h1' }
    await renderWithProviders(<AssetTransactionScreen />, seed)

    await fireEvent.press(screen.getByRole('radio', { name: 'Sell' }))
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '3')
    await fireEvent.changeText(screen.getByLabelText('Unit price'), '150')
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText("You only hold 2 units. Short positions aren't supported.")).toBeOnTheScreen()
  })
})
