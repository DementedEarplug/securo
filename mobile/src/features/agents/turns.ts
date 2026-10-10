import type { AgentMessage, ToolResult } from './types'

export interface ToolRun {
  /** Persisted tool-call id, or a draft-local one while streaming. */
  id: string
  name: string
  args: Record<string, unknown>
  /** Missing while the tool is still running. */
  result?: ToolResult
}

export type ChatItem =
  | {
      kind: 'user'
      id: string
      text: string
      /** Optimistic only: how many saved user messages had this text when it was sent. */
      baseline?: number
    }
  | { kind: 'assistant'; id: string; text: string; tools: ToolRun[]; pending?: boolean; error?: string }

/**
 * Persisted messages → what the chat shows. Each assistant tool call is paired
 * with the `tool` message that answered it (by `tool_call_id`), so a call and
 * its result render together, as on the web.
 */
export function historyToItems(messages: AgentMessage[]): ChatItem[] {
  const results = new Map<string, AgentMessage>()
  for (const message of messages) {
    const callId = message.role === 'tool' ? message.tool_result?.tool_call_id : undefined
    if (callId) results.set(callId, message)
  }
  const items: ChatItem[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      items.push({ kind: 'user', id: message.id, text: message.content ?? '' })
    } else if (message.role === 'assistant') {
      const tools = (message.tool_calls ?? []).map((call): ToolRun => {
        const answer = results.get(call.id)
        return {
          id: call.id,
          name: call.name,
          args: call.arguments ?? {},
          result: answer
            ? { ok: answer.tool_result?.ok ?? false, data: answer.tool_result?.data, text: answer.content }
            : undefined,
        }
      })
      if (tools.length || message.content) {
        items.push({ kind: 'assistant', id: message.id, text: message.content ?? '', tools })
      }
    }
  }
  return items
}

/**
 * Whether the saved history already holds an optimistic user message (a new
 * conversation's history loads mid-stream), so it isn't shown twice. Counting
 * against the baseline keeps a repeated "yes" visible.
 */
export function isSaved(pending: Extract<ChatItem, { kind: 'user' }>, saved: ChatItem[]): boolean {
  return countUserMessages(saved, pending.text) > (pending.baseline ?? 0)
}

export function countUserMessages(saved: ChatItem[], text: string): number {
  const wanted = text.trim()
  return saved.filter((item) => item.kind === 'user' && item.text.trim() === wanted).length
}

/** Attach a streamed `tool_result` to the oldest still-running call of that tool. */
export function attachResult(tools: ToolRun[], name: string, result: ToolResult): ToolRun[] {
  const index = tools.findIndex((tool) => tool.name === name && !tool.result)
  if (index === -1) return tools
  return tools.map((tool, i) => (i === index ? { ...tool, result } : tool))
}

/**
 * Three conversation starters for an empty chat, picked by rotating the pool
 * from an offset derived from the agent id — stable across renders.
 */
export function pickSuggestions(pool: string[], agentId: string, count = 3): string[] {
  if (!pool.length) return []
  let hash = 0
  for (let i = 0; i < agentId.length; i++) hash = (hash * 31 + agentId.charCodeAt(i)) | 0
  const start = Math.abs(hash) % pool.length
  return Array.from({ length: Math.min(count, pool.length) }, (_, i) => pool[(start + i) % pool.length]!)
}
