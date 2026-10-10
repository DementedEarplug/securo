import type { components } from '@/api/schema'

type SettingsUpdate = components['schemas']['InvoiceSettingsUpdate']

/** The document labels a sender actually renames (the web offers the same nine). */
export const EDITABLE_LABELS = [
  'invoice',
  'billTo',
  'from',
  'description',
  'quantity',
  'unitPrice',
  'total',
  'paymentDetails',
  'notes',
] as const

export interface SettingsValues {
  preset: 'tracking' | 'document'
  numberPrefix: string
  paymentTerms: string
  issuerName: string
  paymentDetails: string
  accentColor: string
  footerNote: string
  labels: Record<string, string>
}

export function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
}

/** Blank clears: these settings are nullable on the server, and null means "none". */
const blankable = (value: string) => value.trim() || null

/**
 * The PATCH body. Labels live inside the free-form template, which is
 * replaced whole, so the rest of it (custom fields) is carried over; an
 * empty label means "use the default", not "print nothing".
 */
export function settingsPatch(values: SettingsValues, template: Record<string, unknown> | null): SettingsUpdate {
  const labels = Object.fromEntries(Object.entries(values.labels).filter(([, text]) => text.trim()).map(([k, text]) => [k, text.trim()]))
  return {
    preset: values.preset,
    number_prefix: blankable(values.numberPrefix),
    default_payment_terms_days: Number(values.paymentTerms),
    issuer_display_name: blankable(values.issuerName),
    payment_details: blankable(values.paymentDetails),
    accent_color: blankable(values.accentColor),
    footer_note: blankable(values.footerNote),
    template: { ...(template ?? {}), labels },
  }
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** A picked photo may have no name; the server reads the type, the upload still needs one. */
export function logoFilename(fileName: string | null | undefined, mimeType: string | null | undefined): string {
  if (fileName) return fileName
  return `logo.${EXTENSIONS[mimeType ?? ''] ?? 'jpg'}`
}
