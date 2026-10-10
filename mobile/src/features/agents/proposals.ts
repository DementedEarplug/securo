import { apiFetch } from '@/api/client'

// Mirrors frontend/src/lib/agent-proposals.ts and the apply logic in
// frontend/src/components/agents/proposal-card.tsx. The agent's `propose_*`
// tools never write anything; the user applies a proposal from the client,
// through the same endpoints the rest of the app uses.

export const PROPOSAL_KINDS = [
  'categorize',
  'create_category',
  'create_budget',
  'create_payee_rule',
  'create_rule',
  'update_rule',
  'delete_rule',
  'create_transaction',
  'create_recurring_transaction',
  'update_recurring_transaction',
  'cancel_recurring_transaction',
  'create_goal',
] as const
export type ProposalKind = (typeof PROPOSAL_KINDS)[number]

export interface ProposalData {
  kind?: ProposalKind
  proposed?: Record<string, unknown>
  target?: Record<string, unknown>
  changes?: Record<string, unknown>
  affected?: { id: string; description?: string; amount?: number; currency?: string }[]
  affected_count?: number
  target_category?: { id: string; name: string }
  name_collision?: { id: string; name: string }
  mode?: 'deactivate' | 'delete'
  error?: string
}

/** A tool result is a proposal when its data names a known kind. */
export function isProposalData(data: unknown): data is ProposalData {
  if (!data || typeof data !== 'object') return false
  const kind = (data as { kind?: unknown }).kind
  return typeof kind === 'string' && (PROPOSAL_KINDS as readonly string[]).includes(kind)
}

/** Proposal tools are named `propose_*` (possibly server-prefixed). */
export function isProposalToolName(name: string): boolean {
  return name.includes('propose_')
}

/** A proposal that failed validation still renders as a (red) card. */
export function proposalFromResult(toolName: string, data: unknown): ProposalData | null {
  if (!isProposalToolName(toolName) || !data || typeof data !== 'object') return null
  if (isProposalData(data)) return data
  const error = (data as { error?: unknown }).error
  return typeof error === 'string' ? { error } : null
}

export interface ProposalRequest {
  method: 'POST' | 'PATCH' | 'DELETE'
  path: string
  body?: unknown
}

const str = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined)
const num = (value: unknown): number | undefined => (value == null || value === '' ? undefined : Number(value))
const id = (value: unknown): string => encodeURIComponent(String(value))

/** The API call that applies a proposal, exactly as the web app makes it. */
export function proposalRequest(data: ProposalData): ProposalRequest {
  const p = data.proposed ?? {}
  const target = data.target ?? {}
  switch (data.kind) {
    case 'categorize':
      return {
        method: 'PATCH',
        path: '/api/transactions/bulk-categorize',
        body: { transaction_ids: (data.affected ?? []).map((a) => a.id), category_id: data.target_category?.id ?? null },
      }
    case 'create_category':
      return {
        method: 'POST',
        path: '/api/categories',
        body: { name: String(p.name), group_id: str(p.group_id), icon: str(p.icon), color: str(p.color) },
      }
    case 'create_budget':
      return {
        method: 'POST',
        path: '/api/budgets',
        body: { category_id: String(p.category_id), amount: Number(p.amount), month: String(p.month) },
      }
    case 'create_payee_rule':
      return {
        method: 'POST',
        path: '/api/rules',
        body: {
          name: `Rule: ${String(p.match_pattern).slice(0, 60)}`,
          conditions_op: 'and',
          conditions: [{ field: 'description', op: 'contains', value: String(p.match_pattern) }],
          actions: [{ op: 'set_category', value: String(p.category_id) }],
          priority: 10,
          is_active: true,
        },
      }
    case 'create_rule':
      return { method: 'POST', path: '/api/rules', body: p }
    case 'update_rule':
      return { method: 'PATCH', path: `/api/rules/${id(target.id)}`, body: data.changes ?? {} }
    case 'delete_rule':
      return { method: 'DELETE', path: `/api/rules/${id(target.id)}` }
    case 'create_transaction': {
      // Group splits come back as {member_id, share_amount, share_pct};
      // the API calls the member `group_member_id`.
      const splits = p.splits as { share_type?: string; items?: Record<string, unknown>[] } | undefined
      const splitsBody =
        splits && Array.isArray(splits.items) && splits.items.length > 0
          ? {
              share_type: String(splits.share_type || 'equal'),
              splits: splits.items.map((item) => ({
                group_member_id: String(item.member_id),
                ...(item.share_amount != null ? { share_amount: Number(item.share_amount) } : {}),
                ...(item.share_pct != null ? { share_pct: Number(item.share_pct) } : {}),
              })),
            }
          : undefined
      return {
        method: 'POST',
        path: '/api/transactions',
        body: {
          description: String(p.description),
          amount: Number(p.amount),
          currency: str(p.currency),
          type: str(p.type),
          date: str(p.date),
          account_id: str(p.account_id),
          category_id: str(p.category_id),
          notes: str(p.notes),
          ...(splitsBody ? { splits: splitsBody } : {}),
        },
      }
    }
    case 'create_recurring_transaction':
      return {
        method: 'POST',
        path: '/api/recurring-transactions',
        body: {
          description: String(p.description),
          amount: Number(p.amount),
          currency: str(p.currency),
          type: str(p.type),
          frequency: str(p.frequency),
          day_of_month: num(p.day_of_month),
          start_date: str(p.start_date),
          end_date: str(p.end_date),
          account_id: str(p.account_id),
          category_id: str(p.category_id),
        },
      }
    case 'update_recurring_transaction':
      return { method: 'PATCH', path: `/api/recurring-transactions/${id(target.id)}`, body: data.changes ?? {} }
    case 'cancel_recurring_transaction':
      return data.mode === 'delete'
        ? { method: 'DELETE', path: `/api/recurring-transactions/${id(target.id)}` }
        : { method: 'PATCH', path: `/api/recurring-transactions/${id(target.id)}`, body: { is_active: false } }
    case 'create_goal':
      // The tool says `deadline`/`initial_amount`; GoalCreate calls them
      // `target_date`/`current_amount` (as the tool's own apply path maps them).
      return {
        method: 'POST',
        path: '/api/goals',
        body: {
          name: String(p.name),
          target_amount: Number(p.target_amount),
          currency: str(p.currency),
          target_date: str(p.deadline),
          current_amount: num(p.initial_amount),
          icon: str(p.icon),
          color: str(p.color),
        },
      }
    default:
      throw new Error(`Unknown proposal kind: ${String(data.kind)}`)
  }
}

/** Apply a proposal; throws `ApiError` when the server refuses it. */
export async function applyProposal(data: ProposalData): Promise<void> {
  const { method, path, body } = proposalRequest(data)
  await apiFetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    // JSON.stringify drops the `undefined` optionals, as axios does on the web.
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
