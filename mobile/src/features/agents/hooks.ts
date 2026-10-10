import AsyncStorage from '@react-native-async-storage/async-storage'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/api/client'
import { useWorkspaceKey } from '@/features/session/hooks'
import { hasPendingDocs } from './manage'
import { applyProposal, type ProposalData } from './proposals'
import { uploadableFile, type PickedFile } from '@/lib/upload'
import type { Agent, AgentMessage, AgentTool, ConnectionTestResult, Conversation, KnowledgeDoc, LlmConnection } from './types'

async function getJson<T>(path: string): Promise<T> {
  return (await (await apiFetch(path)).json()) as T
}

async function send<T>(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown): Promise<T | null> {
  const response = await apiFetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return response.status === 204 ? null : ((await response.json()) as T)
}

const path = (id: string) => encodeURIComponent(id)

export function useAgents({ includeArchived = false }: { includeArchived?: boolean } = {}) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'agents', { includeArchived }],
    queryFn: () => getJson<Agent[]>(`/api/agents?include_archived=${includeArchived}`),
  })
}

export function useAgent(id: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'agents', id],
    queryFn: () => getJson<Agent>(`/api/agents/${path(id)}`),
    enabled: Boolean(id),
  })
}

/** LLM connections, to say which provider/model answers ("via …"). */
export function useLlmConnections() {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'agent-connections'],
    queryFn: () => getJson<LlmConnection[]>('/api/agents/connections'),
    staleTime: 60_000,
  })
}

export function useConversations(agentId: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'agent-conversations', agentId],
    queryFn: () => getJson<Conversation[]>(`/api/agents/conversations?agent_id=${path(agentId)}&limit=50`),
    enabled: Boolean(agentId),
  })
}

export function messagesKey(ws: string, conversationId: string | null) {
  return [ws, 'agent-messages', conversationId] as const
}

export function useMessages(conversationId: string | null) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: messagesKey(ws, conversationId),
    queryFn: () => getJson<AgentMessage[]>(`/api/agents/conversations/${path(conversationId!)}/messages?limit=200`),
    enabled: Boolean(conversationId),
  })
}

function useConversationMutation<A>(fn: (args: A) => Promise<unknown>) {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [ws, 'agent-conversations'] }),
  })
}

export function useRenameConversation() {
  return useConversationMutation(({ id, title }: { id: string; title: string }) =>
    send<Conversation>(`/api/agents/conversations/${path(id)}`, 'PATCH', { title }),
  )
}

export function useDeleteConversation() {
  return useConversationMutation((id: string) => send(`/api/agents/conversations/${path(id)}`, 'DELETE'))
}

/** Ask the server to name a fresh conversation from its first exchange. */
export function generateTitle(conversationId: string) {
  return send<Conversation>(`/api/agents/conversations/${path(conversationId)}/generate-title`, 'POST')
}

// Which proposals were applied, by tool-call id, so a card stays "applied"
// when the conversation is reopened (the web keeps the same in localStorage).
const APPLIED_KEY = 'securo:agent-proposal-applied'
const APPLIED_QUERY = ['agent-proposals-applied'] as const

async function readApplied(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(APPLIED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function useAppliedProposals() {
  return useQuery({ queryKey: APPLIED_QUERY, queryFn: readApplied, staleTime: Infinity })
}

export function useApplyProposal() {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ toolCallId, data }: { toolCallId: string; data: ProposalData }) => {
      await applyProposal(data)
      const applied = { ...(await readApplied()), [toolCallId]: Date.now() }
      await AsyncStorage.setItem(APPLIED_KEY, JSON.stringify(applied))
      return applied
    },
    onSuccess: (applied) => {
      queryClient.setQueryData(APPLIED_QUERY, applied)
      // A proposal can touch transactions, categories, budgets, rules,
      // recurring items or goals: refresh everything in this workspace.
      void queryClient.invalidateQueries({ queryKey: [ws] })
    },
  })
}

// ---- Managing assistants, their tools and knowledge, and LLM connections ----

function useWsMutation<A, R>(fn: (args: A) => Promise<R>, keys: string[]) {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of keys) void queryClient.invalidateQueries({ queryKey: [ws, key] })
    },
  })
}

export function useSaveAgent() {
  // `is_default` on one agent clears it on the others, so refresh the list.
  return useWsMutation(
    ({ id, body }: { id?: string; body: Record<string, unknown> }) =>
      id ? send<Agent>(`/api/agents/${path(id)}`, 'PATCH', body) : send<Agent>('/api/agents', 'POST', body),
    ['agents'],
  )
}

export function useDeleteAgent() {
  return useWsMutation((id: string) => send(`/api/agents/${path(id)}`, 'DELETE'), ['agents', 'agent-conversations'])
}

export function useAgentTools(agentId: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'agent-tools', agentId],
    queryFn: () => getJson<{ tools: AgentTool[] }>(`/api/agents/${path(agentId)}/tools`),
  })
}

export function useSaveAgentTools(agentId: string) {
  return useWsMutation(
    (items: { server: string; tool_name: string; enabled: boolean }[]) => send(`/api/agents/${path(agentId)}/tools`, 'PUT', items),
    ['agent-tools'],
  )
}

export function useKnowledge(agentId: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'agent-knowledge', agentId],
    queryFn: () => getJson<{ items: KnowledgeDoc[]; total: number }>(`/api/agents/${path(agentId)}/knowledge`),
    // Uploads are parsed and embedded in the background; poll until done.
    refetchInterval: (query) => (hasPendingDocs(query.state.data?.items) ? 3000 : false),
  })
}

export function useUploadKnowledge(agentId: string) {
  return useWsMutation(async (picked: PickedFile) => {
    const form = new FormData()
    form.append('file', await uploadableFile(picked))
    form.append('pinned', 'false')
    const response = await apiFetch(`/api/agents/${path(agentId)}/knowledge`, { method: 'POST', body: form })
    return (await response.json()) as KnowledgeDoc
  }, ['agent-knowledge', 'agents'])
}

export function usePinKnowledge(agentId: string) {
  return useWsMutation(
    ({ id, pinned }: { id: string; pinned: boolean }) =>
      send<KnowledgeDoc>(`/api/agents/${path(agentId)}/knowledge/${path(id)}/pin?pinned=${pinned}`, 'PATCH'),
    ['agent-knowledge'],
  )
}

export function useDeleteKnowledge(agentId: string) {
  return useWsMutation(
    (id: string) => send(`/api/agents/${path(agentId)}/knowledge/${path(id)}`, 'DELETE'),
    ['agent-knowledge', 'agents'],
  )
}

export function useSaveConnection() {
  return useWsMutation(
    ({ id, body }: { id?: string; body: Record<string, unknown> }) =>
      id
        ? send<LlmConnection>(`/api/agents/connections/${path(id)}`, 'PATCH', body)
        : send<LlmConnection>('/api/agents/connections', 'POST', body),
    ['agent-connections'],
  )
}

export function useDeleteConnection() {
  return useWsMutation((id: string) => send(`/api/agents/connections/${path(id)}`, 'DELETE'), ['agent-connections', 'agents'])
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (id: string) => send<ConnectionTestResult>(`/api/agents/connections/${path(id)}/test`, 'POST'),
  })
}
