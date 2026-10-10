import { isSafeLink, parseInline, parseMarkdown } from './markdown-parser'

describe('parseInline', () => {
  it('reads emphasis, code and links', () => {
    expect(parseInline('a **bold** and *it* `x = 1` [docs](https://e.com)')).toEqual([
      { text: 'a ' },
      { text: 'bold', bold: true },
      { text: ' and ' },
      { text: 'it', italic: true },
      { text: ' ' },
      { text: 'x = 1', code: true },
      { text: ' ' },
      { text: 'docs', href: 'https://e.com' },
    ])
  })

  it('nests emphasis inside bold and leaves snake_case alone', () => {
    expect(parseInline('**very _big_ deal**')).toEqual([
      { text: 'very ', bold: true },
      { text: 'big', bold: true, italic: true },
      { text: ' deal', bold: true },
    ])
    expect(parseInline('use account_id_here')).toEqual([{ text: 'use account_id_here' }])
  })
})

describe('parseMarkdown', () => {
  it('splits headings, lists, paragraphs and rules', () => {
    const blocks = parseMarkdown('## Summary\nYou spent **$40**.\nMostly food.\n\n- Food\n- Rent\n\n1. one\n2. two\n\n---')
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'rule'])
    expect(blocks[2]).toMatchObject({ ordered: false, items: [[{ text: 'Food' }], [{ text: 'Rent' }]] })
    expect(blocks[3]).toMatchObject({ ordered: true, start: 1 })
  })

  it('reads fenced code, including a chart block still streaming in', () => {
    expect(parseMarkdown('```securo-chart\n{"type":"bar"')).toEqual([{ type: 'code', lang: 'securo-chart', text: '{"type":"bar"' }])
  })

  it('reads GFM tables', () => {
    const [table] = parseMarkdown('| Category | Total |\n|---|---:|\n| Food | 40 |\n| Rent | 900 |')
    expect(table).toMatchObject({
      type: 'table',
      header: [[{ text: 'Category' }], [{ text: 'Total' }]],
      rows: [
        [[{ text: 'Food' }], [{ text: '40' }]],
        [[{ text: 'Rent' }], [{ text: '900' }]],
      ],
    })
  })
})

it('only opens web links', () => {
  expect(isSafeLink('https://usesecuro.com')).toBe(true)
  expect(isSafeLink('javascript:alert(1)')).toBe(false)
  expect(isSafeLink('securo://transactions')).toBe(false)
})
