import { apiFetch } from '@/api/client'
import { createSseParser, streamChat } from './stream'
import type { StreamEvent } from './types'

jest.mock('@/api/client', () => ({ apiFetch: jest.fn() }))

function collect() {
  const events: StreamEvent[] = []
  return { events, parser: createSseParser((e) => events.push(e)) }
}

describe('createSseParser', () => {
  it('dispatches each event once its blank line arrives, across chunk boundaries', () => {
    const { events, parser } = collect()
    parser.push('event: conversation\ndata: {"conversation_id":"c1"}\n\nevent: text_de')
    expect(events).toEqual([{ kind: 'conversation', conversation_id: 'c1' }])
    parser.push('lta\ndata: {"type":"text_delta","text":"Hel')
    parser.push('lo"}\n\n')
    expect(events[1]).toEqual({ kind: 'text_delta', type: 'text_delta', text: 'Hello' })
  })

  it('handles CRLF framing and multi-line data', () => {
    const { events, parser } = collect()
    parser.push('event: tool_call\r\ndata: {"tool_name":"list_accounts",\r\ndata: "tool_args":{}}\r\n\r\n')
    expect(events).toEqual([{ kind: 'tool_call', tool_name: 'list_accounts', tool_args: {} }])
  })

  it('reports a malformed payload as an error instead of throwing', () => {
    const { events, parser } = collect()
    parser.push('event: text_delta\ndata: {not json\n\n')
    expect(events).toEqual([{ kind: 'error', error_code: 'parse', error_message: '{not json' }])
  })

  it('reads what the server sends when the agent has no model', () => {
    // Captured from POST /api/agents/{id}/chat on a dev server.
    const { events, parser } = collect()
    parser.push(
      'event: conversation\ndata: {"conversation_id": "e957a95c"}\n\n' +
        'event: error\ndata: {"type": "error", "error_code": "config", "error_message": "Agent has no model configured. Pick a connection or set agent.model."}\n\n' +
        'event: done\ndata: {"type": "done", "finish_reason": "error"}\n\n',
    )
    parser.end()
    expect(events).toEqual([
      { kind: 'conversation', conversation_id: 'e957a95c' },
      { kind: 'error', type: 'error', error_code: 'config', error_message: 'Agent has no model configured. Pick a connection or set agent.model.' },
      { kind: 'done', type: 'done', finish_reason: 'error' },
    ])
  })

  it('flushes a final event that has no trailing blank line', () => {
    const { events, parser } = collect()
    parser.push(': keep-alive\nevent: done\ndata: {"finish_reason":"stop"}')
    parser.end()
    expect(events).toEqual([{ kind: 'done', finish_reason: 'stop' }])
  })
})

describe('streamChat', () => {
  const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>

  function streamingResponse(chunks: string[]): Response {
    const encoder = new TextEncoder()
    let i = 0
    const reader = {
      read: async () => (i < chunks.length ? { value: encoder.encode(chunks[i++]), done: false } : { value: undefined, done: true }),
    }
    return { body: { getReader: () => reader }, text: async () => chunks.join('') } as unknown as Response
  }

  it('posts the message for the mobile channel and streams the reply', async () => {
    mockedFetch.mockResolvedValueOnce(
      streamingResponse(['event: conversation\ndata: {"conversation_id":"c9"}\n\n', 'event: text_delta\ndata: {"text":"Hi"}\n\n']),
    )
    const events: StreamEvent[] = []
    await streamChat({ agentId: 'a 1', content: 'hello', conversationId: null, onEvent: (e) => events.push(e) })

    const [path, init] = mockedFetch.mock.calls[0]!
    expect(path).toBe('/api/agents/a%201/chat')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ content: 'hello', conversation_id: null, channel: 'mobile', page_context: null })
    expect(events.map((e) => e.kind)).toEqual(['conversation', 'text_delta'])
  })

  it('falls back to reading the whole body when it cannot stream', async () => {
    mockedFetch.mockResolvedValueOnce({ body: null, text: async () => 'event: done\ndata: {}\n\nevent: x\ndata: {"a":1}\n\n' } as unknown as Response)
    const events: StreamEvent[] = []
    await streamChat({ agentId: 'a', content: 'x', onEvent: (e) => events.push(e) })
    expect(events.map((e) => e.kind)).toEqual(['done', 'x'])
  })
})
