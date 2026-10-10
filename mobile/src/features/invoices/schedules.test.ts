import { emptyLine } from './model'
import {
  endPayload,
  isUpcomingTerm,
  monthlyEquivalent,
  periodLabel,
  scheduleActions,
  scheduleLabel,
  sortTerms,
  termPerPeriod,
  toMakeRecurring,
  toScheduleCreate,
  toScheduleUpdate,
  toTermPayload,
  validateEnd,
  validateScheduleForm,
  validateTerm,
  type ScheduleFormValues,
  type ScheduleTerm,
} from './schedules'

const line = { ...emptyLine(), description: 'Retainer', unitPrice: '1000' }

const values = (overrides: Partial<ScheduleFormValues> = {}): ScheduleFormValues => ({
  name: 'Hosting',
  payeeId: 'p1',
  frequency: 'monthly',
  startDate: '2026-10-01',
  paymentTerms: '',
  currency: 'USD',
  notes: '',
  endType: 'never',
  endDate: null,
  endCount: '',
  lines: [line],
  ...overrides,
})

it('normalises a period amount to a month', () => {
  expect(monthlyEquivalent(100, 'weekly')).toBeCloseTo(433.33)
  expect(monthlyEquivalent(300, 'quarterly')).toBe(100)
  expect(monthlyEquivalent(1200, 'yearly')).toBe(100)
})

it('labels what needs a person first', () => {
  expect(scheduleLabel({ status: 'paused', pause_reason: 'failures', past_due_count: 0 })).toBe('paused_failures')
  expect(scheduleLabel({ status: 'active', pause_reason: null, past_due_count: 2 })).toBe('past_due')
  expect(scheduleLabel({ status: 'ended', pause_reason: null, past_due_count: 2 })).toBe('ended')
})

it('offers actions from the stored decisions', () => {
  expect(scheduleActions({ status: 'active', invoice_count: 0, origin: 'local' })).toMatchObject({
    canPause: true,
    canResume: false,
    canGenerate: true,
    canDelete: true,
  })
  expect(scheduleActions({ status: 'paused', invoice_count: 3, origin: 'local' })).toMatchObject({ canResume: true, canGenerate: false, canDelete: false })
  expect(scheduleActions({ status: 'ended', invoice_count: 3, origin: 'local' })).toMatchObject({ canEnd: false, canEdit: false, canChangePrice: false })
  expect(scheduleActions({ status: 'active', invoice_count: 0, origin: 'imported' }).canGenerate).toBe(false)
})

it('sends only the end the shape needs', () => {
  expect(endPayload({ endType: 'never', endDate: '2027-01-01', endCount: '3' })).toEqual({ end_type: 'never', end_date: null, end_count: null })
  expect(endPayload({ endType: 'on_date', endDate: '2027-01-01', endCount: '3' })).toEqual({ end_type: 'on_date', end_date: '2027-01-01', end_count: null })
  expect(endPayload({ endType: 'after_count', endDate: null, endCount: '12' })).toEqual({ end_type: 'after_count', end_date: null, end_count: 12 })
  expect(validateEnd({ endType: 'after_count', endDate: null, endCount: '0' })).toBe('invoices.errors.end_count_required')
  expect(validateEnd({ endType: 'on_date', endDate: null, endCount: '' })).toBe('invoices.errors.end_date_required')
})

describe('schedule form', () => {
  it('validates the agreement', () => {
    expect(validateScheduleForm(values(), 'en-US', { withLines: true })).toBeNull()
    expect(validateScheduleForm(values({ name: ' ' }), 'en-US', { withLines: true })).toBe('invoices.errors.name_required')
    expect(validateScheduleForm(values({ paymentTerms: '1.5' }), 'en-US', { withLines: true })).toBe('invoices.schedules.form.termsInvalid')
    expect(validateScheduleForm(values({ lines: [{ ...line, unitPrice: '0' }] }), 'en-US', { withLines: true })).toBe('invoices.errors.term_empty')
    // Editing doesn't touch the price.
    expect(validateScheduleForm(values({ lines: [] }), 'en-US', { withLines: false })).toBeNull()
  })

  it('creates with the first term and the workspace terms by default', () => {
    expect(toScheduleCreate(values({ notes: ' n ' }), 'en-US', false)).toEqual({
      name: 'Hosting',
      payee_id: 'p1',
      frequency: 'monthly',
      start_date: '2026-10-01',
      end_type: 'never',
      end_date: null,
      end_count: null,
      payment_terms_days: null,
      currency: 'USD',
      notes: 'n',
      lines: [{ description: 'Retainer', quantity: '1', unit: null, unit_price: '1000', tax_rate: null }],
    })
  })

  it('leaves the frequency and start alone once invoices exist', () => {
    expect(toScheduleUpdate(values({ paymentTerms: '15' }), { locked: true })).not.toHaveProperty('frequency')
    expect(toScheduleUpdate(values(), { locked: false })).toMatchObject({ frequency: 'monthly', start_date: '2026-10-01' })
    expect(toScheduleUpdate(values({ paymentTerms: '15' }), { locked: true }).payment_terms_days).toBe(15)
  })

  it('repeats an invoice with an optional name', () => {
    expect(toMakeRecurring({ name: ' ', frequency: 'yearly', startDate: '2026-01-01', endType: 'never', endDate: null, endCount: '' })).toEqual({
      frequency: 'yearly',
      name: undefined,
      start_date: '2026-01-01',
      end_type: 'never',
      end_date: null,
      end_count: null,
    })
  })
})

describe('terms', () => {
  it('prices a period as lines less the discount', () => {
    const term = { effectiveFrom: '2026-11-01', lines: [line], discount: '100' }
    expect(termPerPeriod(term, 'en-US')).toBe(900)
    expect(validateTerm(term, 'en-US')).toBeNull()
    expect(validateTerm({ ...term, discount: '2000' }, 'en-US')).toBe('invoices.errors.term_empty')
    expect(validateTerm({ ...term, lines: [] }, 'en-US')).toBe('invoices.errors.term_lines_required')
    expect(toTermPayload(term, 'en-US', false)).toMatchObject({ effective_from: '2026-11-01', discount: '100' })
    expect(toTermPayload({ ...term, discount: '' }, 'en-US', false).discount).toBeNull()
  })

  it('sorts terms and tells which are still ahead', () => {
    const terms = [{ id: 'b', effective_from: '2026-12-01' }, { id: 'a', effective_from: '2026-01-01' }] as ScheduleTerm[]
    expect(sortTerms(terms).map((x) => x.id)).toEqual(['a', 'b'])
    const today = new Date(2026, 9, 9)
    expect(isUpcomingTerm('2026-10-10', today)).toBe(true)
    expect(isUpcomingTerm('2026-10-09', today)).toBe(false)
  })
})

it('labels a period as a range', () => {
  const label = periodLabel('2026-09-05', '2026-10-04', 'en-US')
  expect(label).toContain('2026')
  expect(label).toMatch(/Sep/)
  expect(label).toMatch(/Oct/)
})
