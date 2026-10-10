import { DEFAULT_OPTIONS, previewForm, toImportPayload, type ReviewRow } from './api'

// Stands in for the expo-file-system File the app uploads.
const file = { name: 'statement.csv', type: 'text/csv' } as unknown as Blob

// Record parts as appended; Node's FormData would coerce the stand-in file.
class RNFormData {
  _parts: [string, unknown][] = []
  append(name: string, value: unknown) {
    this._parts.push([name, value])
  }
}
const NodeFormData = globalThis.FormData
beforeAll(() => {
  globalThis.FormData = RNFormData as unknown as typeof FormData
})
afterAll(() => {
  globalThis.FormData = NodeFormData
})

function entries(form: FormData): Record<string, unknown> {
  return Object.fromEntries((form as unknown as RNFormData)._parts)
}

describe('previewForm', () => {
  it('sends only the file by default', () => {
    const form = entries(previewForm(file, DEFAULT_OPTIONS))
    expect(Object.keys(form)).toEqual(['file'])
    expect(form.file).toBe(file)
  })

  it('sends the CSV options the user set', () => {
    const form = entries(
      previewForm(file, {
        dateFormat: 'DD/MM/YYYY',
        flipAmount: true,
        inflowColumn: 'Credit',
        outflowColumn: 'Debit',
        columnMapping: { date: 'Posted', description: '' },
      }),
    )
    expect(form).toMatchObject({
      date_format: 'DD/MM/YYYY',
      flip_amount: 'true',
      inflow_column: 'Credit',
      outflow_column: 'Debit',
      column_mapping: '{"date":"Posted"}',
    })
  })

  it('needs both split columns before sending either', () => {
    const form = entries(previewForm(file, { ...DEFAULT_OPTIONS, inflowColumn: 'Credit' }))
    expect(form).not.toHaveProperty('inflow_column')
  })
})

describe('toImportPayload', () => {
  const row = {
    description: 'Coffee',
    amount: '4.50',
    date: '2026-10-01',
    type: 'debit',
    excluded: false,
    suggested_category_id: 'cat-suggested',
    suggested_category_name: 'Food',
  } as ReviewRow

  it('leaves categorisation to the server rules unless the user chose', () => {
    const [sent] = toImportPayload([row])
    expect(sent).not.toHaveProperty('suggested_category_id')
    expect(sent).not.toHaveProperty('category_id')
  })

  it('sends a chosen category, or forces uncategorized', () => {
    expect(toImportPayload([{ ...row, chosenCategoryId: 'cat-1' }])[0]).toMatchObject({
      category_id: 'cat-1',
      force_uncategorized: false,
    })
    expect(toImportPayload([{ ...row, chosenCategoryId: null }])[0]).toMatchObject({
      category_id: null,
      force_uncategorized: true,
    })
  })
})
