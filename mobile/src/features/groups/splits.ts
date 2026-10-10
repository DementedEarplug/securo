import type { components } from '@/api/schema'
import type { Transaction } from '@/api/types'
import { formatAmountInput, parseAmountInput } from '@/lib/format'

export type ShareType = 'equal' | 'exact' | 'percent'

export interface SplitState {
  groupId: string | null
  shareType: ShareType
  /** Members taking part, with an amount or percentage as typed (exact/percent). */
  shares: Record<string, { included: boolean; value: string }>
}

export const NO_SPLIT: SplitState = { groupId: null, shareType: 'equal', shares: {} }

export function splitFromTransaction(tx: Transaction, locale: string): SplitState {
  const splits = tx.splits ?? []
  if (!splits.length || !tx.group_id) return NO_SPLIT
  const shareType = (splits[0]!.share_type as ShareType) ?? 'equal'
  return {
    groupId: tx.group_id,
    shareType,
    shares: Object.fromEntries(
      splits.map((s) => [
        s.group_member_id,
        {
          included: true,
          value:
            shareType === 'percent'
              ? String(s.share_pct ?? '')
              : shareType === 'exact'
                ? formatAmountInput(Number(s.share_amount), locale)
                : '',
        },
      ]),
    ),
  }
}

/**
 * Why a split can't be saved, as an i18n key, or null when it can. The server
 * requires exact shares to add up to the amount and percentages to 100.
 */
export function splitError(split: SplitState, amount: number | null, locale: string): string | null {
  if (!split.groupId) return null
  const included = Object.entries(split.shares).filter(([, s]) => s.included)
  if (included.length === 0) return 'groups.split.chooseMembers'
  if (split.shareType === 'equal') return null
  const values = included.map(([, s]) => parseAmountInput(s.value, locale))
  if (values.some((v) => v === null || v < 0)) return 'groups.split.invalidShare'
  const total = values.reduce<number>((sum, v) => sum + (v ?? 0), 0)
  if (split.shareType === 'percent') return Math.abs(total - 100) < 0.005 ? null : 'groups.split.percentTotal'
  return amount !== null && Math.abs(total - amount) < 0.005 ? null : 'groups.split.exactTotal'
}

export function toSplitsInput(split: SplitState, locale: string): components['schemas']['TransactionSplitsInput'] | null {
  if (!split.groupId) return null
  return {
    share_type: split.shareType,
    splits: Object.entries(split.shares)
      .filter(([, s]) => s.included)
      .map(([memberId, s]) => ({
        group_member_id: memberId,
        ...(split.shareType === 'exact' ? { share_amount: String(parseAmountInput(s.value, locale) ?? 0) } : {}),
        ...(split.shareType === 'percent' ? { share_pct: String(parseAmountInput(s.value, locale) ?? 0) } : {}),
      })),
  }
}

/** Removing a split on update is an empty equal split; leaving `splits` out keeps it. */
export const CLEAR_SPLITS: components['schemas']['TransactionSplitsInput'] = { share_type: 'equal', splits: [] }
