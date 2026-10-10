import { z } from 'zod'

import type { components } from '@/api/schema'
import type { Account } from '@/api/types'
import { toIsoDate } from '@/lib/dates'
import { formatAmountInput, parseAmountInput } from '@/lib/format'

/** The types the web app offers; the server accepts any string. */
export const ACCOUNT_TYPES = ['checking', 'savings', 'credit_card', 'investment', 'wallet'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export interface AccountFormValues {
  name: string
  displayName: string
  type: string
  currency: string
  /** Opening balance as typed; for a credit card, the amount owed. */
  balance: string
  balanceDate: string
  creditLimit: string
  statementCloseDay: string
  paymentDueDay: string
}

const day = z
  .string()
  .refine((v) => v.trim() === '' || (/^\d+$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= 31), 'accounts.form.dayInvalid')

export function accountFormSchema(locale: string, { connected }: { connected: boolean }) {
  return z.object({
    name: connected ? z.string() : z.string().trim().min(1, 'accounts.form.nameRequired').max(255),
    displayName: z.string().max(255),
    type: z.string().min(1),
    currency: z.string().length(3),
    balance: z.string().refine((v) => v.trim() === '' || parseAmountInput(v, locale) !== null, 'accounts.form.amountInvalid'),
    balanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    creditLimit: z
      .string()
      .refine((v) => v.trim() === '' || (parseAmountInput(v, locale) ?? -1) >= 0, 'accounts.form.amountInvalid'),
    statementCloseDay: day,
    paymentDueDay: day,
  })
}

export function emptyAccountValues(currency: string, today = new Date()): AccountFormValues {
  return {
    name: '',
    displayName: '',
    type: 'checking',
    currency,
    balance: '',
    balanceDate: toIsoDate(today),
    creditLimit: '',
    statementCloseDay: '',
    paymentDueDay: '',
  }
}

export function accountValuesFrom(account: Account, locale: string, today = new Date()): AccountFormValues {
  const opening = Number(account.balance)
  return {
    name: account.name,
    displayName: account.display_name ?? '',
    type: account.type,
    currency: account.currency ?? 'USD',
    balance: opening ? formatAmountInput(opening, locale) : '',
    balanceDate: toIsoDate(today),
    creditLimit: account.credit_limit != null ? formatAmountInput(account.credit_limit, locale) : '',
    statementCloseDay: account.statement_close_day?.toString() ?? '',
    paymentDueDay: account.payment_due_day?.toString() ?? '',
  }
}

function dayOrNull(value: string): number | null {
  const n = Number(value)
  return value.trim() && n >= 1 && n <= 31 ? n : null
}

/** Credit-card fields are cleared by the server for other types; send null so the form agrees. */
function cardFields(values: AccountFormValues, locale: string) {
  if (values.type !== 'credit_card') {
    return { credit_limit: null, statement_close_day: null, payment_due_day: null }
  }
  return {
    credit_limit: values.creditLimit.trim() ? String(parseAmountInput(values.creditLimit, locale)) : null,
    statement_close_day: dayOrNull(values.statementCloseDay),
    payment_due_day: dayOrNull(values.paymentDueDay),
  }
}

export function toAccountCreate(values: AccountFormValues, locale: string): components['schemas']['AccountCreate'] {
  return {
    name: values.name.trim(),
    type: values.type,
    currency: values.currency,
    balance: String(parseAmountInput(values.balance, locale) ?? 0),
    balance_date: values.balanceDate,
    ...cardFields(values, locale),
  }
}

/**
 * Bank-connected accounts only accept a display name, a type override and the
 * card fields (the server rejects anything else with 400).
 */
export function toAccountUpdate(
  values: AccountFormValues,
  locale: string,
  { connected }: { connected: boolean },
): components['schemas']['AccountUpdate'] {
  const common = {
    display_name: values.displayName.trim() || null,
    type: values.type,
    ...cardFields(values, locale),
  }
  if (connected) return common
  return {
    ...common,
    name: values.name.trim(),
    balance: String(parseAmountInput(values.balance, locale) ?? 0),
    balance_date: values.balanceDate,
  }
}
