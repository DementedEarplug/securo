// The agents routes are only mounted when the server runs with AGENTS_ENABLED,
// so they aren't in the committed OpenAPI snapshot. These mirror
// backend/app/agents/schemas/{agent,conversation}.py.

export interface Agent {
  id: string
  name: string
  description: string | null
  system_prompt: string
  icon: string
  color: string
  connection_id: string | null
  provider: string | null
  model: string | null
  temperature: number
  auto_context: boolean
  is_archived: boolean
  is_default: boolean
  /** Filled by the list endpoint only. */
  conversation_count: number
  knowledge_count: number
  created_at: string
  updated_at: string
}

export type LlmConnectionKind = 'ollama' | 'openai' | 'anthropic' | 'openai_compatible'

/** The server never returns the API key, only whether one is stored. */
export interface LlmConnection {
  id: string
  name: string
  kind: LlmConnectionKind
  base_url: string | null
  default_model: string | null
  is_default: boolean
  has_api_key: boolean
}

export interface ConnectionTestResult {
  ok: boolean
  detail: string
  models?: string[]
}

export interface AgentTool {
  server: string
  name: string
  description: string
  /** `propose_*` tools: suggest changes the user applies. */
  is_proposal: boolean
  enabled: boolean
}

export interface KnowledgeDoc {
  id: string
  agent_id: string
  title: string
  mime: string
  size_bytes: number
  status: 'pending' | 'processing' | 'ready' | 'failed'
  error: string | null
  chunk_count: number
  pinned: boolean
  created_at: string
}

export interface Conversation {
  id: string
  agent_id: string
  channel: string
  title: string | null
  created_at: string
  updated_at: string
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolResult {
  ok?: boolean
  data?: unknown
  text?: string | null
}

export interface AgentMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  ordinal: number
  content: string | null
  tool_calls: ToolCall[] | null
  tool_result: { tool_call_id?: string; name?: string; data?: unknown; ok?: boolean } | null
  created_at: string
}

/** One Server-Sent Event from `POST /api/agents/{id}/chat`. */
export type StreamEvent =
  | { kind: 'conversation'; conversation_id: string }
  | { kind: 'text_delta'; text: string }
  | { kind: 'tool_call'; tool_name: string; tool_args: Record<string, unknown> }
  | { kind: 'tool_result'; tool_name: string; tool_result: ToolResult }
  | { kind: 'citation'; citation: Record<string, unknown> }
  | { kind: 'error'; error_code?: string; error_message?: string }
  | { kind: 'done'; finish_reason?: string }
