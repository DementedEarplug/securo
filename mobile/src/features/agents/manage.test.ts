import {
  agentFormValues,
  connectionFormValues,
  groupTools,
  hasPendingDocs,
  isKnowledgeFile,
  toAgentPayload,
  toConnectionPayload,
  toolToggles,
} from './manage'
import type { Agent, AgentTool, LlmConnection } from './types'

const connection = (c: Partial<LlmConnection> & Pick<LlmConnection, 'id'>): LlmConnection => ({
  name: c.id,
  kind: 'openai',
  base_url: null,
  default_model: null,
  is_default: false,
  has_api_key: false,
  ...c,
})

describe('agent form', () => {
  it('starts a new assistant on the default connection, else the only one', () => {
    expect(agentFormValues(undefined, [connection({ id: 'a' }), connection({ id: 'b', is_default: true })]).connectionId).toBe('b')
    expect(agentFormValues(undefined, [connection({ id: 'a' })]).connectionId).toBe('a')
    expect(agentFormValues(undefined, []).connectionId).toBe('')
  })

  it('loads an existing assistant', () => {
    const agent = { name: 'Tax', description: null, system_prompt: 'Be brief', connection_id: 'c', model: null, temperature: 0.7, auto_context: false, is_default: true } as Agent
    expect(agentFormValues(agent, [])).toEqual({
      name: 'Tax',
      description: '',
      systemPrompt: 'Be brief',
      connectionId: 'c',
      model: '',
      temperature: '0.7',
      autoContext: false,
      isDefault: true,
    })
  })

  it('requires a name and connection and a temperature from 0 to 2', () => {
    const blank = agentFormValues(undefined, [])
    expect(toAgentPayload({ ...blank, temperature: '3' })).toEqual({
      errors: { name: 'agents.form.nameRequired', connectionId: 'agents.form.connectionRequired', temperature: 'agents.form.temperatureRange' },
    })
  })

  it('builds the payload the web sends, accepting a decimal comma', () => {
    const values = { ...agentFormValues(undefined, [connection({ id: 'c' })]), name: ' Tax ', description: ' ', model: ' gpt-4o ', temperature: '0,2' }
    expect(toAgentPayload(values)).toEqual({
      payload: {
        name: 'Tax',
        description: null,
        system_prompt: '',
        connection_id: 'c',
        model: 'gpt-4o',
        temperature: 0.2,
        auto_context: true,
        is_default: false,
      },
    })
  })
})

describe('connection form', () => {
  it('needs an endpoint only for OpenAI-compatible servers', () => {
    const values = { ...connectionFormValues(), name: 'LM Studio', kind: 'openai_compatible' as const }
    expect(toConnectionPayload(values, false)).toEqual({ errors: { baseUrl: 'agents.connections.baseUrlRequired' } })
    expect('payload' in toConnectionPayload({ ...values, kind: 'ollama' }, false)).toBe(true)
  })

  it('keeps the stored API key on edit unless the user typed a new one', () => {
    const existing = connectionFormValues(connection({ id: 'c', name: 'OpenAI', has_api_key: true, default_model: 'gpt-4o-mini' }))
    expect(toConnectionPayload(existing, true)).toEqual({
      payload: { name: 'OpenAI', base_url: null, default_model: 'gpt-4o-mini', is_default: false },
    })
    expect(toConnectionPayload({ ...existing, apiKey: 'sk-new', keyTouched: true }, true)).toMatchObject({ payload: { api_key: 'sk-new' } })
  })

  it('sends the kind and key when creating', () => {
    expect(toConnectionPayload({ ...connectionFormValues(), name: 'Local' }, false)).toEqual({
      payload: { name: 'Local', kind: 'ollama', base_url: null, default_model: null, is_default: false, api_key: null },
    })
  })
})

describe('tools', () => {
  const tools: AgentTool[] = [
    { server: 'securo', name: 'list_accounts', description: '', is_proposal: false, enabled: true },
    { server: 'web', name: 'search', description: '', is_proposal: false, enabled: false },
    { server: 'securo', name: 'propose_create_goal', description: '', is_proposal: true, enabled: true },
  ]

  it('groups by server in listed order', () => {
    expect(groupTools(tools).map(([server, items]) => [server, items.map((t) => t.name)])).toEqual([
      ['securo', ['list_accounts', 'propose_create_goal']],
      ['web', ['search']],
    ])
  })

  it('applies local switches to the saved body', () => {
    expect(toolToggles(tools, { 'web.search': true, 'securo.list_accounts': false })).toEqual([
      { server: 'securo', tool_name: 'list_accounts', enabled: false },
      { server: 'web', tool_name: 'search', enabled: true },
      { server: 'securo', tool_name: 'propose_create_goal', enabled: true },
    ])
  })
})

describe('knowledge', () => {
  it('accepts the document types the web accepts', () => {
    expect(isKnowledgeFile('Tax Guide.PDF')).toBe(true)
    expect(isKnowledgeFile('notes.md')).toBe(true)
    expect(isKnowledgeFile('photo.jpg')).toBe(false)
    expect(isKnowledgeFile('README')).toBe(false)
  })

  it('polls while a document is still processing', () => {
    expect(hasPendingDocs([{ status: 'ready' }, { status: 'processing' }])).toBe(true)
    expect(hasPendingDocs([{ status: 'ready' }, { status: 'failed' }])).toBe(false)
    expect(hasPendingDocs(undefined)).toBe(false)
  })
})
