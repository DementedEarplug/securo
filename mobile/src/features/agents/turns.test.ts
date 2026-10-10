import { parseChart } from './chart'
import { attachResult, countUserMessages, historyToItems, isSaved, pickSuggestions } from './turns'
import type { AgentMessage } from './types'

const message = (m: Partial<AgentMessage> & Pick<AgentMessage, 'id' | 'role'>): AgentMessage => ({
  ordinal: 0,
  content: null,
  tool_calls: null,
  tool_result: null,
  created_at: '2026-10-01T00:00:00Z',
  ...m,
})

describe('historyToItems', () => {
  it('pairs each tool call with its result and hides tool/system rows', () => {
    const items = historyToItems([
      message({ id: 's', role: 'system', content: 'primer' }),
      message({ id: 'u', role: 'user', content: 'net worth?' }),
      message({ id: 'a1', role: 'assistant', tool_calls: [{ id: 'call-1', name: 'net_worth', arguments: { months: 1 } }] }),
      message({ id: 't', role: 'tool', content: 'ok', tool_result: { tool_call_id: 'call-1', ok: true, data: { total: 10 } } }),
      message({ id: 'a2', role: 'assistant', content: 'About $10.' }),
    ])
    expect(items).toEqual([
      { kind: 'user', id: 'u', text: 'net worth?' },
      {
        kind: 'assistant',
        id: 'a1',
        text: '',
        tools: [{ id: 'call-1', name: 'net_worth', args: { months: 1 }, result: { ok: true, data: { total: 10 }, text: 'ok' } }],
      },
      { kind: 'assistant', id: 'a2', text: 'About $10.', tools: [] },
    ])
  })
})

describe('attachResult', () => {
  it('fills the oldest running call of that tool', () => {
    const tools = [
      { id: '1', name: 'search', args: {} },
      { id: '2', name: 'search', args: {} },
    ]
    const once = attachResult(tools, 'search', { ok: true })
    expect(once.map((t) => Boolean(t.result))).toEqual([true, false])
    expect(attachResult(once, 'other', { ok: true })).toBe(once)
  })
})

describe('optimistic user message', () => {
  const saved = historyToItems([message({ id: 'u1', role: 'user', content: 'yes' })])

  it('is hidden once history has it, but a repeated message still shows', () => {
    expect(isSaved({ kind: 'user', id: 'p', text: 'yes', baseline: 0 }, saved)).toBe(true)
    expect(isSaved({ kind: 'user', id: 'p', text: 'yes', baseline: countUserMessages(saved, 'yes') }, saved)).toBe(false)
  })
})

it('picks stable suggestions per agent', () => {
  const pool = ['a', 'b', 'c', 'd', 'e']
  expect(pickSuggestions(pool, 'agent-1')).toEqual(pickSuggestions(pool, 'agent-1'))
  expect(pickSuggestions(pool, 'agent-1')).toHaveLength(3)
  expect(pickSuggestions([], 'x')).toEqual([])
})

describe('parseChart', () => {
  it('normalizes multi-series and single-series charts', () => {
    const multi = parseChart(
      JSON.stringify({
        type: 'line',
        currency: 'USD',
        data: [
          { x: 'Jan', income: 3000, expense: 1800 },
          { x: 'Feb', income: '3100', expense: null },
        ],
        series: [{ key: 'income', name: 'Income', color: '#10B981' }, { key: 'expense' }],
      }),
    )
    expect(multi).toMatchObject({
      type: 'line',
      currency: 'USD',
      labels: ['Jan', 'Feb'],
      series: [
        { key: 'income', name: 'Income', color: '#10B981', values: [3000, 3100] },
        { key: 'expense', name: 'expense', values: [1800, 0] },
      ],
    })
    expect(parseChart('{"type":"bar","data":[{"x":"Food","y":5}]}')).toMatchObject({ series: [{ key: 'y', values: [5] }] })
  })

  it('reads pie slices and rejects what it cannot draw', () => {
    expect(parseChart('{"type":"pie","data":[{"name":"Food","value":2},{"x":"Rent","y":8}]}')).toMatchObject({
      slices: [
        { name: 'Food', value: 2 },
        { name: 'Rent', value: 8 },
      ],
    })
    expect(parseChart('{"type":"radar","data":[]}')).toBeNull()
    expect(parseChart('{"type":"bar"')).toBeNull()
  })
})
