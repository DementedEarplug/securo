// A small Markdown reader for assistant replies. The web renders them with
// react-markdown + GFM; models mostly emit paragraphs, lists, emphasis, code,
// tables and links, so that is what this covers. No raw HTML, no images.

export interface Span {
  text: string
  bold?: boolean
  italic?: boolean
  strike?: boolean
  code?: boolean
  href?: string
}

export type Block =
  | { type: 'paragraph'; spans: Span[] }
  | { type: 'heading'; level: number; spans: Span[] }
  | { type: 'list'; ordered: boolean; start: number; items: Span[][] }
  | { type: 'quote'; spans: Span[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'table'; header: Span[][]; rows: Span[][][] }
  | { type: 'rule' }

const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+(.*)$/
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const FENCE = /^\s*(```|~~~)\s*([\w+-]*)\s*$/
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!

    const fence = FENCE.exec(line)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i]!.trim().startsWith(fence[1]!)) body.push(lines[i++]!)
      i++ // closing fence (or end of a still-streaming block)
      blocks.push({ type: 'code', lang: fence[2] ?? '', text: body.join('\n') })
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1]!.length, spans: parseInline(heading[2]!) })
      i++
      continue
    }
    if (RULE.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1]!)) {
      const header = tableCells(line).map((cell) => parseInline(cell))
      const rows: Span[][][] = []
      i += 2
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) {
        rows.push(tableCells(lines[i++]!).map((cell) => parseInline(cell)))
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }
    if (line.trimStart().startsWith('>')) {
      const body: string[] = []
      while (i < lines.length && lines[i]!.trimStart().startsWith('>')) {
        body.push(lines[i++]!.trimStart().replace(/^>\s?/, ''))
      }
      blocks.push({ type: 'quote', spans: parseInline(body.join('\n')) })
      continue
    }
    const item = LIST_ITEM.exec(line)
    if (item) {
      const ordered = /\d/.test(item[1]!)
      const start = ordered ? parseInt(item[1]!, 10) : 1
      const items: string[] = []
      while (i < lines.length) {
        const current = lines[i]!
        const match = LIST_ITEM.exec(current)
        if (match && /\d/.test(match[1]!) === ordered) {
          items.push(match[2]!)
        } else if (current.trim() && /^\s+/.test(current) && items.length) {
          // A wrapped or nested line continues the previous item.
          items[items.length - 1] += `\n${current.trim()}`
        } else {
          break
        }
        i++
      }
      blocks.push({ type: 'list', ordered, start, items: items.map((item) => parseInline(item)) })
      continue
    }
    const body: string[] = []
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !FENCE.test(lines[i]!) &&
      !HEADING.test(lines[i]!) &&
      !LIST_ITEM.test(lines[i]!) &&
      !lines[i]!.trimStart().startsWith('>')
    ) {
      body.push(lines[i++]!)
    }
    blocks.push({ type: 'paragraph', spans: parseInline(body.join('\n')) })
  }
  return blocks
}

// Earliest match wins; on a tie the order below decides (`**` before `*`).
const INLINE: { pattern: RegExp; build: (m: RegExpExecArray, outer: Omit<Span, 'text'>) => Span[] }[] = [
  { pattern: /`([^`]+)`/, build: (m, outer) => [{ ...outer, text: m[1]!, code: true }] },
  {
    pattern: /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/,
    build: (m, outer) => parseInline(m[1]!, { ...outer, href: m[2]! }),
  },
  { pattern: /\*\*([^*]+(?:\*(?!\*)[^*]*)*)\*\*|__([^_]+)__/, build: (m, outer) => parseInline(m[1] ?? m[2]!, { ...outer, bold: true }) },
  { pattern: /~~([^~]+)~~/, build: (m, outer) => parseInline(m[1]!, { ...outer, strike: true }) },
  {
    pattern: /\*([^*\s][^*]*)\*|\b_([^_\s][^_]*)_\b/,
    build: (m, outer) => parseInline(m[1] ?? m[2]!, { ...outer, italic: true }),
  },
]

export function parseInline(text: string, outer: Omit<Span, 'text'> = {}): Span[] {
  const spans: Span[] = []
  let rest = text
  while (rest) {
    let best: { index: number; match: RegExpExecArray; rule: (typeof INLINE)[number] } | null = null
    for (const rule of INLINE) {
      const match = rule.pattern.exec(rest)
      if (match && (!best || match.index < best.index)) best = { index: match.index, match, rule }
    }
    if (!best) {
      spans.push({ ...outer, text: rest })
      break
    }
    if (best.index > 0) spans.push({ ...outer, text: rest.slice(0, best.index) })
    spans.push(...best.rule.build(best.match, outer))
    rest = rest.slice(best.index + best.match[0].length)
  }
  return spans
}

/** Only web links open from a chat reply. */
export function isSafeLink(href: string): boolean {
  return /^https?:\/\//i.test(href)
}
