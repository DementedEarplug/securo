import type { components } from '@/api/schema'

type Schemas = components['schemas']
export type AdminUser = Schemas['AdminUserRead']
export type AdminUserCreate = Schemas['AdminUserCreate']
export type AdminUserUpdate = Schemas['AdminUserUpdate']
export type TimezoneSetting = Schemas['TimezoneSettingRead']

/** Instance settings an administrator can change (`ALLOWED_SETTINGS` on the server). */
export type SettingKey =
  | 'registration_enabled'
  | 'credit_card_accounting_mode'
  | 'use_provider_categories'
  | 'number_format'
  | 'date_format'
  | 'theme_color_light'
  | 'theme_color_dark'
  | 'timezone'

/**
 * What the server does when a setting was never saved (it answers 404), so the
 * screen shows the behaviour in effect rather than a blank. Registration has
 * no fixed default (it falls back to an environment variable); its effective
 * value comes from `/api/admin/registration-status`.
 */
export const SETTING_DEFAULTS: Partial<Record<SettingKey, string>> = {
  credit_card_accounting_mode: 'cash',
  use_provider_categories: 'true',
  number_format: 'auto',
  date_format: 'auto',
}

export function effectiveSetting(key: SettingKey, saved: string | null | undefined): string | null {
  return saved ?? SETTING_DEFAULTS[key] ?? null
}

export const ACCOUNTING_MODES = ['cash', 'accrual'] as const
export const NUMBER_FORMATS = ['auto', 'comma_dot', 'dot_comma', 'space_comma'] as const
export const DATE_FORMATS = ['auto', 'dmy', 'mdy', 'ymd'] as const

/** The languages the web app ships; a new user's language is for the web UI. */
export const USER_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'pt-BR', label: 'Português (BR)' },
  { code: 'pt-PT', label: 'Português (PT)' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pl', label: 'Polski' },
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'sk', label: 'Slovenčina' },
  { code: 'el', label: 'Ελληνικά' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ja', label: '日本語' },
]

export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 72

export interface UserFormValues {
  email: string
  password: string
  isActive: boolean
  isSuperuser: boolean
  language: string
  currency: string
}

export type UserFormErrors = Partial<Record<'email' | 'password', string>>

// Deliberately loose: the server validates with EmailStr; this only catches typos.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * i18n keys for what's wrong with the form. A new user needs a password; an
 * existing one keeps theirs when the field is left blank.
 */
export function validateUserForm(values: UserFormValues, creating: boolean): UserFormErrors {
  const errors: UserFormErrors = {}
  if (!EMAIL.test(values.email.trim())) errors.email = 'admin.users.errors.email'
  if (creating || values.password) {
    if (values.password.length < MIN_PASSWORD) errors.password = 'admin.users.errors.passwordShort'
    else if (values.password.length > MAX_PASSWORD) errors.password = 'admin.users.errors.passwordLong'
  }
  return errors
}

export function toUserCreate(values: UserFormValues): AdminUserCreate {
  return {
    email: values.email.trim(),
    password: values.password,
    is_superuser: values.isSuperuser,
    preferences: { language: values.language, currency_display: values.currency },
  }
}

/** Only what changed, as the web sends it; `null` when nothing did. */
export function toUserUpdate(user: AdminUser, values: UserFormValues): AdminUserUpdate | null {
  const update: AdminUserUpdate = {}
  const email = values.email.trim()
  if (email !== user.email) update.email = email
  if (values.isActive !== user.is_active) update.is_active = values.isActive
  if (values.isSuperuser !== user.is_superuser) update.is_superuser = values.isSuperuser
  if (values.password) update.password = values.password
  return Object.keys(update).length ? update : null
}

/** Timezones matching a search, with the saved one kept even if the server no longer knows it. */
export function timezoneOptions(setting: TimezoneSetting): string[] {
  const zones = [...setting.available]
  if (setting.saved && !zones.includes(setting.saved)) zones.unshift(setting.saved)
  return zones
}

export function savedTimezoneIsBroken(setting: TimezoneSetting): boolean {
  return Boolean(setting.saved) && !setting.available.includes(setting.saved!)
}

export function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value)
}

/** `admin.users.*` keys describing a user in the list: role, status, and whether it's you. */
export function userSubtitleParts(user: AdminUser, selfId: string | undefined): ('admin' | 'user' | 'inactive' | 'you')[] {
  const parts: ('admin' | 'user' | 'inactive' | 'you')[] = [user.is_superuser ? 'admin' : 'user']
  if (!user.is_active) parts.push('inactive')
  if (user.id === selfId) parts.push('you')
  return parts
}
