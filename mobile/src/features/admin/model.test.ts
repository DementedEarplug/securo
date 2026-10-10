import {
  effectiveSetting,
  isHexColor,
  savedTimezoneIsBroken,
  timezoneOptions,
  toUserCreate,
  toUserUpdate,
  userSubtitleParts,
  validateUserForm,
  type AdminUser,
  type UserFormValues,
} from './model'

const user: AdminUser = { id: 'u1', email: 'ana@example.com', is_active: true, is_superuser: false, is_verified: true }
const values = (patch: Partial<UserFormValues> = {}): UserFormValues => ({
  email: 'ana@example.com',
  password: '',
  isActive: true,
  isSuperuser: false,
  language: 'pt-BR',
  currency: 'BRL',
  ...patch,
})

describe('validateUserForm', () => {
  it('requires a plausible email', () => {
    expect(validateUserForm(values({ email: 'ana', password: 'secret123' }), true).email).toBe('admin.users.errors.email')
    expect(validateUserForm(values({ email: ' ana@example.com ', password: 'secret123' }), true)).toEqual({})
  })

  it('requires a password of 8 to 72 characters for a new user', () => {
    expect(validateUserForm(values(), true).password).toBe('admin.users.errors.passwordShort')
    expect(validateUserForm(values({ password: 'x'.repeat(73) }), true).password).toBe('admin.users.errors.passwordLong')
  })

  it('lets an existing user keep their password', () => {
    expect(validateUserForm(values(), false)).toEqual({})
    expect(validateUserForm(values({ password: 'short' }), false).password).toBe('admin.users.errors.passwordShort')
  })
})

describe('toUserCreate', () => {
  it('sends the web payload with language and currency preferences', () => {
    expect(toUserCreate(values({ email: ' ana@example.com ', password: 'secret123', isSuperuser: true }))).toEqual({
      email: 'ana@example.com',
      password: 'secret123',
      is_superuser: true,
      preferences: { language: 'pt-BR', currency_display: 'BRL' },
    })
  })
})

describe('toUserUpdate', () => {
  it('returns null when nothing changed', () => {
    expect(toUserUpdate(user, values())).toBeNull()
  })

  it('sends only the changed fields', () => {
    expect(toUserUpdate(user, values({ isActive: false, password: 'newpass123' }))).toEqual({
      is_active: false,
      password: 'newpass123',
    })
    expect(toUserUpdate(user, values({ email: 'ana@new.com', isSuperuser: true }))).toEqual({
      email: 'ana@new.com',
      is_superuser: true,
    })
  })
})

describe('settings', () => {
  it('shows the server default for a setting never saved', () => {
    expect(effectiveSetting('credit_card_accounting_mode', null)).toBe('cash')
    expect(effectiveSetting('use_provider_categories', null)).toBe('true')
    expect(effectiveSetting('number_format', 'dot_comma')).toBe('dot_comma')
    expect(effectiveSetting('theme_color_light', null)).toBeNull()
  })

  it('validates hex colours as the server does', () => {
    expect(isHexColor('#4F46e5')).toBe(true)
    expect(isHexColor('#fff')).toBe(false)
    expect(isHexColor('4F46E5')).toBe(false)
  })

  it('keeps an unknown saved timezone visible and flags it', () => {
    const setting = { timezone: 'UTC', saved: 'Mars/Olympus', fallback: 'UTC', available: ['America/New_York', 'UTC'] }
    expect(timezoneOptions(setting)).toEqual(['Mars/Olympus', 'America/New_York', 'UTC'])
    expect(savedTimezoneIsBroken(setting)).toBe(true)
    expect(savedTimezoneIsBroken({ ...setting, saved: 'UTC' })).toBe(false)
    expect(savedTimezoneIsBroken({ ...setting, saved: null })).toBe(false)
  })
})

describe('userSubtitleParts', () => {
  it('describes role, status and self', () => {
    expect(userSubtitleParts(user, 'other')).toEqual(['user'])
    expect(userSubtitleParts({ ...user, is_superuser: true, is_active: false }, 'u1')).toEqual(['admin', 'inactive', 'you'])
  })
})
