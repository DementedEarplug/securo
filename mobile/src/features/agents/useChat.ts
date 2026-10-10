import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NetworkError } from '@/api/errors'
import { useWorkspaceKey } from '@/features/session/hooks'
import { errorMessage } from '@/lib/errors'
import { generateTitle, messagesKey } from './hooks'
import { streamChat } from './stream'
import { attachResult, type ChatItem } from './turns'
import type { StreamEvent } from './types'

type Draft = Extract<ChatItem, { kind: 'assistant' }>

/** What one send/stream round learned, read when it ends. */
interface Round {
  conversation: string | null
  error: string | null
}

/**
 * One chat with an agent: the optimistic user bubble, the assistant turn as
 * it streams in, and the error from the last round. Mirrors the web's
 * ChatPanel; when a round ends the persisted history replaces the draft.
 */
export function useChat({
  agentId,
  conversationId,
  onConversation,
}: {
  agentId: string
  conversationId: string | null
  onConversation: (id: string) => void
}) {
  const { t } = useTranslation()
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  const [pendingUser, setPendingUser] = useState<Extract<ChatItem, { kind: 'user' }> | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const counter = useRef(0)

  // Leaving the screen stops the stream; the server keeps what it has.
  useEffect(() => () => controller.current?.abort(), [])

  const handle = (event: StreamEvent, round: Round) => {
    switch (event.kind) {
      case 'conversation':
        round.conversation = event.conversation_id
        if (event.conversation_id !== conversationId) onConversation(event.conversation_id)
        break
      case 'text_delta':
        setDraft((d) => (d ? { ...d, text: d.text + event.text } : d))
        break
      case 'tool_call':
        setDraft((d) =>
          d ? { ...d, tools: [...d.tools, { id: `${d.id}-${d.tools.length}`, name: event.tool_name, args: event.tool_args ?? {} }] } : d,
        )
        break
      case 'tool_result':
        setDraft((d) => (d ? { ...d, tools: attachResult(d.tools, event.tool_name, event.tool_result ?? {}) } : d))
        break
      case 'error': {
        const message = [event.error_code, event.error_message].filter(Boolean).join(': ') || t('errors.generic')
        round.error = message
        setDraft((d) => (d ? { ...d, error: message } : d))
        break
      }
      case 'done':
        setDraft((d) => (d ? { ...d, pending: false } : d))
        break
    }
  }

  const send = async (content: string, baseline = 0) => {
    const text = content.trim()
    if (!text || streaming) return
    const local = `local-${++counter.current}`
    const round: Round = { conversation: conversationId, error: null }
    const startedFresh = !conversationId
    const abort = new AbortController()
    controller.current = abort
    setError(null)
    setStreaming(true)
    setPendingUser({ kind: 'user', id: `${local}-user`, text, baseline })
    setDraft({ kind: 'assistant', id: `${local}-reply`, text: '', tools: [], pending: true })
    try {
      await streamChat({ agentId, content: text, conversationId, signal: abort.signal, onEvent: (event) => handle(event, round) })
    } catch (e) {
      // Stopping on purpose isn't an error.
      if (!(abort.signal.aborted && e instanceof NetworkError)) round.error = errorMessage(e, t)
    } finally {
      if (round.conversation) {
        // Swap the draft for the saved turn only once it has loaded, so the
        // reply never blinks out.
        await queryClient.refetchQueries({ queryKey: messagesKey(ws, round.conversation) }).catch(() => undefined)
      }
      void queryClient.invalidateQueries({ queryKey: [ws, 'agent-conversations'] })
      setPendingUser(null)
      setDraft(null)
      setStreaming(false)
      controller.current = null
      setError(round.error)
      if (!round.error && !abort.signal.aborted && startedFresh && round.conversation) {
        generateTitle(round.conversation)
          .then(() => queryClient.invalidateQueries({ queryKey: [ws, 'agent-conversations'] }))
          .catch(() => undefined)
      }
    }
  }

  return {
    pendingUser,
    draft,
    error,
    streaming,
    send,
    stop: () => controller.current?.abort(),
    dismissError: () => setError(null),
  }
}
