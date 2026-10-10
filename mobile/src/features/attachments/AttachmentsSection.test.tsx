import { fireEvent, screen } from '@testing-library/react-native'
import * as DocumentPicker from 'expo-document-picker'
import { Alert } from 'react-native'

import { renderWithProviders } from '@/test/render'
import { AttachmentsSection } from './AttachmentsSection'

// Lucide ships ES modules Jest doesn't transform; the icons are decoration here.
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}))

const seed: [unknown[], unknown][] = [
  [['me'], { id: 'u', email: 'me@example.com', preferences: { currency_display: 'USD', language: 'en' } }],
  [['settings', 'number-format'], { format: 'comma_dot' }],
  [['settings', 'date-format'], { format: 'mdy' }],
  [['settings', 'attachments'], { allowed_extensions: ['pdf', 'jpg'], max_file_size_mb: 5, max_attachments_per_transaction: 3 }],
  [
    ['default', 'attachments', 'tx-1'],
    [{ id: 'a1', transaction_id: 'tx-1', filename: 'receipt.pdf', content_type: 'application/pdf', size: 48 * 1024, created_at: '2026-10-08T12:00:00Z' }],
  ],
]

describe('AttachmentsSection', () => {
  it('lists files with their size and the server limit', async () => {
    await renderWithProviders(<AttachmentsSection transactionId="tx-1" canWrite />, seed)

    expect(screen.getByText('Attachments (1/3)')).toBeOnTheScreen()
    expect(screen.getByText('receipt.pdf')).toBeOnTheScreen()
    expect(screen.getByText(/^48 KB · Oct 8, 2026$/)).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Camera' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'More actions for receipt.pdf' })).toBeOnTheScreen()
  })

  it('lets viewers open files but not change them', async () => {
    await renderWithProviders(<AttachmentsSection transactionId="tx-1" canWrite={false} />, seed)

    expect(screen.getByLabelText('Open receipt.pdf')).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Camera' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'More actions for receipt.pdf' })).toBeNull()
  })

  it('refuses a file type the server would reject, before uploading', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/setup.exe', name: 'setup.exe', size: 10, mimeType: 'application/octet-stream', lastModified: 0 }],
    })
    await renderWithProviders(<AttachmentsSection transactionId="tx-1" canWrite />, seed)

    await fireEvent.press(screen.getByRole('button', { name: 'File' }))

    expect(alert).toHaveBeenCalledWith("Can't add this file", "This file type isn't accepted. Allowed: pdf, jpg.")
    alert.mockRestore()
  })
})
