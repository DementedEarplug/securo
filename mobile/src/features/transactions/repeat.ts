import type { components } from '@/api/schema'

type Schemas = components['schemas']

export const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'yearly'] as const
export type Frequency = (typeof FREQUENCIES)[number]

/** How a new transaction repeats: not at all, as an installment plan, or as a recurring bill. */
export type Repeat =
  | { kind: 'none' }
  | { kind: 'installments'; count: string; frequency: Frequency }
  | { kind: 'recurring'; frequency: Frequency; endDate: string | null }

export const NO_REPEAT: Repeat = { kind: 'none' }

/** Installment plans are 2–360 payments (the server's limits). */
export function installmentCount(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 2 && n <= 360 ? n : null
}

/**
 * An installment plan: the server repeats `base` (one installment's amount)
 * `installments` times. Later installments start pending.
 */
export function toInstallmentSeries(
  base: Schemas['TransactionCreate'],
  repeat: Extract<Repeat, { kind: 'installments' }>,
): Schemas['InstallmentSeriesCreate'] {
  return {
    base,
    installments: installmentCount(repeat.count) ?? 2,
    frequency: repeat.frequency,
    first_installment_status: base.status === 'pending' ? 'pending' : 'posted',
  }
}

/**
 * The recurring entry the web creates next to a transaction marked "repeat":
 * it starts on the transaction's date and skips that first occurrence, since
 * the transaction itself is it.
 */
export function toRecurring(
  created: Schemas['TransactionCreate'],
  currency: string,
  repeat: Extract<Repeat, { kind: 'recurring' }>,
): Schemas['RecurringTransactionCreate'] {
  return {
    description: created.description,
    amount: created.amount,
    currency,
    type: created.type,
    frequency: repeat.frequency,
    start_date: created.date,
    end_date: repeat.endDate,
    category_id: created.category_id ?? null,
    account_id: created.account_id,
    skip_first: true,
  }
}
