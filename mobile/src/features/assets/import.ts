import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'
import { useWorkspaceKey } from '@/features/session/hooks'
import { downloadToCache, shareFile } from '@/lib/download'
import { uploadableFile, type PickedFile } from '@/lib/upload'

type Schemas = components['schemas']
export type AssetImportPreview = Schemas['AssetImportPreview']
export type AssetImportResult = Schemas['AssetImportResult']

/** The fields a CSV column can be mapped to; the first four are required. */
export const ASSET_IMPORT_FIELDS = [
  { key: 'ticker', required: true },
  { key: 'date', required: true },
  { key: 'quantity', required: true },
  { key: 'price', required: true },
  { key: 'fee', required: false },
  { key: 'kind', required: false },
  { key: 'currency', required: false },
  { key: 'notes', required: false },
] as const
export type AssetImportField = (typeof ASSET_IMPORT_FIELDS)[number]['key']

export interface AssetImportOptions {
  columnMapping: Partial<Record<AssetImportField, string>>
  groupId: string | null
}

/** The multipart body for `/assets/import/preview`. */
export function assetPreviewForm(file: Blob, { columnMapping, groupId }: AssetImportOptions): FormData {
  const form = new FormData()
  form.append('file', file)
  const mapping = Object.fromEntries(Object.entries(columnMapping).filter(([, column]) => column))
  if (Object.keys(mapping).length) form.append('column_mapping', JSON.stringify(mapping))
  if (groupId) form.append('group_id', groupId)
  return form
}

/** What importing the file would do (writes nothing). */
export async function fetchAssetPreview(file: PickedFile, options: AssetImportOptions): Promise<AssetImportPreview> {
  const form = assetPreviewForm(await uploadableFile(file), options)
  return unwrap<AssetImportPreview>(
    api().POST('/api/assets/import/preview', {
      // The typed body is the schema's shape; the wire format is the FormData.
      body: {} as never,
      bodySerializer: () => form,
    }),
  )
}

/** Save the starter CSV and offer it to the share sheet (Drive, email, a spreadsheet app). */
export async function shareAssetTemplate(dialogTitle?: string): Promise<void> {
  const { file, mimeType } = await downloadToCache('/api/assets/import/template', 'securo-asset-orders.csv')
  await shareFile(file, mimeType ?? 'text/csv', dialogTitle)
}

/** Apply the previewed orders; refreshes holdings and the import history. */
export function useImportAssetOrders() {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ preview, groupId, filename }: { preview: AssetImportPreview; groupId: string | null; filename: string | null }) =>
      unwrap<AssetImportResult>(
        api().POST('/api/assets/import', {
          body: { orders: preview.orders as Schemas['AssetOrderImport-Input'][], group_id: groupId, filename },
        }),
      ),
    onSuccess: () => {
      for (const key of ['assets', 'asset-groups', 'dashboard', 'goals', 'reports', 'import-logs']) {
        void queryClient.invalidateQueries({ queryKey: [ws, key] })
      }
    },
  })
}
