// Form logic for managing assistants, their tools and knowledge, and LLM
// connections. Mirrors frontend/src/components/agents/{agent-form-dialog,
// connection-form-dialog,tools-section,knowledge-section}.tsx.
import type { Agent, AgentTool, LlmConnection, LlmConnectionKind } from './types'

export interface AgentFormValues {
  name: string
  description: string
  systemPrompt: string
  connectionId: string
  model: string
  temperature: string
  autoContext: boolean
  isDefault: boolean
}

/** Editing loads the agent; a new one starts on the default (or only) connection. */
export function agentFormValues(agent: Agent | undefined, connections: LlmConnection[]): AgentFormValues {
  if (agent) {
    return {
      name: agent.name,
      description: agent.description ?? '',
      systemPrompt: agent.system_prompt ?? '',
      connectionId: agent.connection_id ?? '',
      model: agent.model ?? '',
      temperature: String(agent.temperature ?? 0.4),
      autoContext: agent.auto_context ?? true,
      isDefault: agent.is_default ?? false,
    }
  }
  return {
    name: '',
    description: '',
    systemPrompt: '',
    connectionId: (connections.find((c) => c.is_default) ?? connections[0])?.id ?? '',
    model: '',
    temperature: '0.4',
    autoContext: true,
    isDefault: false,
  }
}

export type AgentFormErrors = Partial<Record<'name' | 'connectionId' | 'temperature', string>>

/** i18n keys for what's wrong, or the API payload. */
export function toAgentPayload(values: AgentFormValues): { errors: AgentFormErrors } | { payload: Record<string, unknown> } {
  const errors: AgentFormErrors = {}
  if (!values.name.trim()) errors.name = 'agents.form.nameRequired'
  if (!values.connectionId) errors.connectionId = 'agents.form.connectionRequired'
  const temperature = values.temperature.trim() === '' ? 0.4 : Number(values.temperature.replace(',', '.'))
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) errors.temperature = 'agents.form.temperatureRange'
  if (Object.keys(errors).length) return { errors }
  return {
    payload: {
      name: values.name.trim(),
      description: values.description.trim() || null,
      system_prompt: values.systemPrompt,
      connection_id: values.connectionId,
      model: values.model.trim() || null,
      temperature,
      auto_context: values.autoContext,
      is_default: values.isDefault,
    },
  }
}

export const CONNECTION_KINDS: Record<
  LlmConnectionKind,
  { label: string; needsBaseUrl: boolean; needsKey: boolean; modelHint: string; urlHint: string; defaultModel?: string }
> = {
  ollama: { label: 'Ollama', needsBaseUrl: false, needsKey: false, modelHint: 'llama3.1:8b', urlHint: 'http://host.docker.internal:11434' },
  // Hosted providers get a sensible default model; self-hosted ones depend
  // on what the user has installed, so they get none (as on the web).
  openai: { label: 'OpenAI', needsBaseUrl: false, needsKey: true, modelHint: 'gpt-4o-mini', urlHint: '', defaultModel: 'gpt-4o-mini' },
  anthropic: { label: 'Anthropic', needsBaseUrl: false, needsKey: true, modelHint: 'claude-haiku-4-5', urlHint: '', defaultModel: 'claude-haiku-4-5' },
  openai_compatible: { label: 'OpenAI-compatible', needsBaseUrl: true, needsKey: false, modelHint: 'llama3.1-70b', urlHint: 'http://192.168.1.142:1234' },
}
export const CONNECTION_KIND_ORDER = Object.keys(CONNECTION_KINDS) as LlmConnectionKind[]

export interface ConnectionFormValues {
  name: string
  kind: LlmConnectionKind
  baseUrl: string
  apiKey: string
  /** Only send the key when the user typed one, so an edit keeps the stored key. */
  keyTouched: boolean
  defaultModel: string
  isDefault: boolean
}

export function connectionFormValues(connection?: LlmConnection): ConnectionFormValues {
  return connection
    ? {
        name: connection.name,
        kind: connection.kind,
        baseUrl: connection.base_url ?? '',
        apiKey: '',
        keyTouched: false,
        defaultModel: connection.default_model ?? '',
        isDefault: connection.is_default,
      }
    : { name: '', kind: 'ollama', baseUrl: '', apiKey: '', keyTouched: false, defaultModel: '', isDefault: false }
}

export function toConnectionPayload(
  values: ConnectionFormValues,
  isEdit: boolean,
): { errors: Partial<Record<'name' | 'baseUrl', string>> } | { payload: Record<string, unknown> } {
  const errors: Partial<Record<'name' | 'baseUrl', string>> = {}
  if (!values.name.trim()) errors.name = 'agents.connections.nameRequired'
  if (CONNECTION_KINDS[values.kind].needsBaseUrl && !values.baseUrl.trim()) errors.baseUrl = 'agents.connections.baseUrlRequired'
  if (Object.keys(errors).length) return { errors }
  const payload: Record<string, unknown> = {
    name: values.name.trim(),
    base_url: values.baseUrl.trim() || null,
    default_model: values.defaultModel.trim() || null,
    is_default: values.isDefault,
  }
  // The kind can't change after creation (ConnectionUpdate has no `kind`).
  if (!isEdit) payload.kind = values.kind
  if (!isEdit || values.keyTouched) payload.api_key = values.apiKey || null
  return { payload }
}

/** Tools grouped by MCP server, in the order the server lists them. */
export function groupTools(tools: AgentTool[]): [string, AgentTool[]][] {
  const groups = new Map<string, AgentTool[]>()
  for (const tool of tools) groups.set(tool.server, [...(groups.get(tool.server) ?? []), tool])
  return [...groups]
}

export function toolKey(tool: Pick<AgentTool, 'server' | 'name'>): string {
  return `${tool.server}.${tool.name}`
}

/** The PUT body for the agent's tool switches, with local overrides applied. */
export function toolToggles(tools: AgentTool[], overrides: Record<string, boolean>) {
  return tools.map((tool) => ({ server: tool.server, tool_name: tool.name, enabled: overrides[toolKey(tool)] ?? tool.enabled }))
}

/** What the web lets you upload as knowledge. */
export const KNOWLEDGE_EXTENSIONS = ['pdf', 'md', 'markdown', 'txt', 'rst']

export function isKnowledgeFile(name: string): boolean {
  const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  return KNOWLEDGE_EXTENSIONS.includes(extension)
}

/** Whether any document is still being parsed/embedded (poll until done). */
export function hasPendingDocs(docs: { status: string }[] | undefined): boolean {
  return (docs ?? []).some((d) => d.status !== 'ready' && d.status !== 'failed')
}
