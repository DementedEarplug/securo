import type { TFunction } from 'i18next'

import { formatCurrency } from '@/lib/format'
import type { ProposalData, ProposalKind } from './proposals'

/** The card heading for a proposal kind. */
export function proposalTitle(kind: ProposalKind, t: TFunction): string {
  return t(`agents.proposal.kind.${kind}`)
}

function money(amount: unknown, currency: unknown, fallbackCurrency: string, locale: string): string {
  if (amount == null || amount === '') return '?'
  const value = Number(amount)
  if (!Number.isFinite(value)) return '?'
  const code = typeof currency === 'string' && currency ? currency : fallbackCurrency
  try {
    return formatCurrency(value, code, locale)
  } catch {
    return `${code} ${value.toFixed(2)}`
  }
}

/** One line describing what applying the proposal will do (as on the web). */
export function proposalSummary(data: ProposalData, t: TFunction, currency: string, locale: string): string {
  const p = data.proposed ?? {}
  const target = data.target ?? {}
  const text = (value: unknown, fallback = '?') => (value == null || value === '' ? fallback : String(value))
  switch (data.kind) {
    case 'categorize':
      return t('agents.proposal.summary.categorize', {
        count: data.affected_count ?? data.affected?.length ?? 0,
        category: data.target_category?.name ?? '?',
      })
    case 'create_category':
      return (
        t('agents.proposal.summary.createCategory', { name: text(p.name) }) +
        (data.name_collision ? ` — ${t('agents.proposal.collision', { name: data.name_collision.name })}` : '')
      )
    case 'create_budget':
      return t('agents.proposal.summary.createBudget', {
        category: text(p.category_name ?? p.category_id),
        amount: money(p.amount, p.currency, currency, locale),
        month: text(p.month),
      })
    case 'create_payee_rule':
      return t('agents.proposal.summary.createPayeeRule', {
        pattern: text(p.match_pattern),
        category: text(p.category_name ?? p.category_id),
      })
    case 'create_rule':
      return `“${text(p.name)}”`
    case 'update_rule':
      return `${text(target.name)} → ${Object.keys(data.changes ?? {}).join(', ')}`
    case 'delete_rule':
      return `“${text(target.name)}”`
    case 'create_transaction':
      return t('agents.proposal.summary.createTransaction', {
        description: text(p.description),
        amount: money(p.amount, p.currency, currency, locale),
        type: t(`agents.proposal.type.${text(p.type)}`, { defaultValue: text(p.type) }),
        date: text(p.date, ''),
        account: text(p.account_name),
      })
    case 'create_recurring_transaction':
      return t('agents.proposal.summary.createRecurring', {
        description: text(p.description),
        amount: money(p.amount, p.currency, currency, locale),
        frequency: text(p.frequency),
        day: text(p.day_of_month || null),
        account: text(p.account_name),
      })
    case 'update_recurring_transaction': {
      const changes = Object.entries(data.changes ?? {}).map(
        ([key, value]) => `${key}: ${text(target[key], '∅')} → ${text(value, '∅')}`,
      )
      return t('agents.proposal.summary.updateRecurring', {
        description: text(target.description),
        changes: changes.join(', ') || '—',
      })
    }
    case 'cancel_recurring_transaction':
      return t(
        data.mode === 'delete' ? 'agents.proposal.summary.deleteRecurring' : 'agents.proposal.summary.deactivateRecurring',
        { description: text(target.description) },
      )
    case 'create_goal':
      return t('agents.proposal.summary.createGoal', {
        name: text(p.name),
        target: money(p.target_amount, p.currency, currency, locale),
        deadline: text(p.deadline, '—'),
      })
    default:
      return ''
  }
}

export interface SplitLine {
  name: string
  amount: string
  pct: number | null
}

/** The per-member split a `create_transaction` proposal carries, if any. */
export function proposalSplits(
  data: ProposalData,
  currency: string,
  locale: string,
): { group: string; shareType: string; lines: SplitLine[] } | null {
  const p = data.proposed ?? {}
  const splits = p.splits as { share_type?: string; items?: Record<string, unknown>[] } | undefined
  if (!splits || !Array.isArray(splits.items) || splits.items.length === 0) return null
  return {
    group: typeof p.group_name === 'string' ? p.group_name : '',
    shareType: splits.share_type || 'equal',
    lines: splits.items.map((item) => ({
      name: String(item.member_name ?? item.member_id ?? '?'),
      amount: money(item.share_amount, p.currency, currency, locale),
      pct: item.share_pct != null ? Number(item.share_pct) : null,
    })),
  }
}
