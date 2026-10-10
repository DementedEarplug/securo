import { apiFetch } from '@/api/client'
import type { StreamEvent } from './types'

/**
 * Incremental Server-Sent Events parser. Feed it decoded text as it arrives;
 * it calls `onEvent` once per complete event (`event:` + `data:` lines ended
 * by a blank line), exactly as the web client's `agents-stream.ts` reads them.
 */
export function createSseParser(onEvent: (event: StreamEvent) => void) {
  let buffer = ''
  let eventName = 'message'
  let data = ''

  function flush() {
    if (data) {
      try {
        onEvent({ ...JSON.parse(data), kind: eventName } as StreamEvent)
      } catch {
        // A malformed payload shouldn't wedge the chat; surface it instead.
        onEvent({ kind: 'error', error_code: 'parse', error_message: data })
      }
    }
    eventName = 'message'
    data = ''
  }

  function line(text: string) {
    if (text === '') flush()
    else if (text.startsWith('event:')) eventName = text.slice(6).trim()
    else if (text.startsWith('data:')) data += (data ? '\n' : '') + text.slice(5).trim()
    // Comments (`:keep-alive`) and unknown fields are ignored, per the spec.
  }

  return {
    push(chunk: string) {
      buffer += chunk
      let index: number
      while ((index = buffer.indexOf('\n')) !== -1) {
        line(buffer.slice(0, index).replace(/\r$/, ''))
        buffer = buffer.slice(index + 1)
      }
    },
    /** The stream closed: dispatch whatever is still pending. */
    end() {
      if (buffer) line(buffer.replace(/\r$/, ''))
      buffer = ''
      flush()
    },
  }
}

export interface ChatRequest {
  agentId: string
  content: string
  conversationId?: string | null
  signal?: AbortSignal
  onEvent: (event: StreamEvent) => void
}

/**
 * Send one message and stream the reply. Resolves when the server closes the
 * stream; throws `ApiError`/`NetworkError` like the rest of the API layer
 * (an abort surfaces as `NetworkError` with `signal.aborted` set).
 */
export async function streamChat({ agentId, content, conversationId, signal, onEvent }: ChatRequest): Promise<void> {
  const response = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/chat`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ content, conversation_id: conversationId ?? null, channel: 'mobile', page_context: null }),
  })
  const parser = createSseParser(onEvent)
  const reader = response.body?.getReader()
  if (!reader) {
    // No streaming body (shouldn't happen with Expo's fetch): parse it whole.
    parser.push(await response.text())
    parser.end()
    return
  }
  const decoder = new TextDecoder('utf-8')
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    parser.push(decoder.decode(value, { stream: true }))
  }
  parser.push(decoder.decode())
  parser.end()
}
