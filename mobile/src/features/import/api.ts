import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap, unwrapAs } from '@/api/client'
import type { components } from '@/api/schema'
import { invalidateFinancialQueries } from '@/features/transactions/hooks'
import { useWorkspaceKey } from '@/features/session/hooks'
import { uploadableFile, type PickedFile } from '@/lib/upload'

export type { PickedFile }

type Schemas = components['schemas']
export type ImportPreview = Schemas['TransactionImportPreview']
export type ImportRow = Schemas['TransactionImport-Output']
export type ImportLog = Schemas['ImportLogRead']


export type DateFormat = '' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'

/** Fields a CSV column can be mapped to (the web's mapping grid). */
export const MAPPABLE_FIELDS = [
  'date',
  'description',
  'amount',
  'type',
  'category',
  'currency',
  'fx_rate',
  'payee',
  'external_id',
  'notes',
] as const
export type MappableField = (typeof MAPPABLE_FIELDS)[number]

export interface PreviewOptions {
  dateFormat: DateFormat
  flipAmount: boolean
  /** Separate inflow/outflow columns instead of one signed amount. */
  inflowColumn: string | null
  outflowColumn: string | null
  columnMapping: Partial<Record<MappableField, string>>
}

export const DEFAULT_OPTIONS: PreviewOptions = {
  dateFormat: '',
  flipAmount: false,
  inflowColumn: null,
  outflowColumn: null,
  columnMapping: {},
}

/**
 * The multipart body for `/transactions/import/preview`. The filename matters:
 * the server picks the parser from its extension.
 */
export function previewForm(file: Blob, options: PreviewOptions): FormData {
  const form = new FormData()
  form.append('file', file)
  if (options.dateFormat) form.append('date_format', options.dateFormat)
  if (options.flipAmount) form.append('flip_amount', 'true')
  if (options.inflowColumn && options.outflowColumn) {
    form.append('inflow_column', options.inflowColumn)
    form.append('outflow_column', options.outflowColumn)
  }
  const mapping = Object.fromEntries(Object.entries(options.columnMapping).filter(([, v]) => v))
  if (Object.keys(mapping).length) form.append('column_mapping', JSON.stringify(mapping))
  return form
}

export async function fetchPreview(file: PickedFile, options: PreviewOptions): Promise<ImportPreview> {
  const form = previewForm(await uploadableFile(file), options)
  return unwrap<ImportPreview>(
    api().POST('/api/transactions/import/preview', {
      // The typed body is the schema's shape; the wire format is the FormData.
      body: {} as never,
      bodySerializer: () => form,
    }),
  )
}

export interface ReviewRow extends ImportRow {
  /** Set when the user picked a category (or "uncategorized") by hand. */
  chosenCategoryId?: string | null
}

/** What the web sends per row: the user's choice wins; otherwise rules decide on the server. */
export function toImportPayload(rows: ReviewRow[]) {
  return rows.map(({ chosenCategoryId, suggested_category_id: _suggested, suggested_category_name: _name, ...row }) => {
    if (chosenCategoryId === undefined) return row
    return {
      ...row,
      category_id: chosenCategoryId,
      force_uncategorized: chosenCategoryId === null,
    }
  })
}

interface ImportResult {
  imported: number
  skipped: number
  excluded: number
  import_log_id: string
}

export function useRunImport() {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Schemas['TransactionImportRequest']) =>
      unwrapAs<ImportResult>(api().POST('/api/transactions/import', { body })),
    onSuccess: () => {
      invalidateFinancialQueries(queryClient, ws)
      void queryClient.invalidateQueries({ queryKey: [ws, 'import-logs'] })
    },
  })
}

export function useImportLogs() {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [ws, 'import-logs'],
    queryFn: () => unwrap<ImportLog[]>(api().GET('/api/import-logs')),
    select: (logs) => logs.filter((log) => (log.entity ?? 'transactions') === 'transactions'),
  })
}

/** Undo an import: deletes every transaction it created. */
export function useUndoImport() {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap<unknown>(api().DELETE('/api/import-logs/{import_log_id}', { params: { path: { import_log_id: id } } })),
    onSuccess: () => {
      invalidateFinancialQueries(queryClient, ws)
      void queryClient.invalidateQueries({ queryKey: [ws, 'import-logs'] })
    },
  })
}
