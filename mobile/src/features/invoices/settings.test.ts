import { isHexColor, logoFilename, settingsPatch, type SettingsValues } from './settings'

const values: SettingsValues = {
  preset: 'document',
  numberPrefix: ' INV- ',
  paymentTerms: '15',
  issuerName: '',
  paymentDetails: 'IBAN X',
  accentColor: '#112233',
  footerNote: '  ',
  labels: { invoice: 'Fatura', billTo: '  ' },
}

it('clears blank settings and keeps the rest of the template', () => {
  expect(settingsPatch(values, { custom_fields: [{ key: 'po' }], labels: { notes: 'Old' } })).toEqual({
    preset: 'document',
    number_prefix: 'INV-',
    default_payment_terms_days: 15,
    issuer_display_name: null,
    payment_details: 'IBAN X',
    accent_color: '#112233',
    footer_note: null,
    template: { custom_fields: [{ key: 'po' }], labels: { invoice: 'Fatura' } },
  })
})

it('checks colours and names logos', () => {
  expect(isHexColor('#abc')).toBe(true)
  expect(isHexColor('#12345678')).toBe(true)
  expect(isHexColor('red')).toBe(false)
  expect(logoFilename('mark.png', 'image/png')).toBe('mark.png')
  expect(logoFilename(null, 'image/webp')).toBe('logo.webp')
  expect(logoFilename(undefined, null)).toBe('logo.jpg')
})
