import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Directory, File, Paths } from 'expo-file-system'

import { api, apiFetch, unwrap, unwrapAs } from '@/api/client'
import type { components } from '@/api/schema'
import { useWorkspaceKey } from '@/features/session/hooks'
import { sanitizeFilename } from '@/lib/download'
import { uploadableFile, type PickedFile } from '@/lib/upload'
import { DEFAULT_LIMITS, type AttachmentLimits } from './rules'

export type Attachment = components['schemas']['AttachmentRead']

/** Instance-wide limits; they only change when the server is reconfigured. */
export function useAttachmentLimits(): AttachmentLimits {
  return (
    useQuery({
      queryKey: ['settings', 'attachments'],
      queryFn: () => unwrapAs<AttachmentLimits>(api().GET('/api/settings/attachments')),
      staleTime: 5 * 60 * 1000,
    }).data ?? DEFAULT_LIMITS
  )
}

const listKey = (ws: string, transactionId: string) => [ws, 'attachments', transactionId]

export function useAttachments(transactionId: string) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: listKey(ws, transactionId),
    queryFn: () =>
      unwrap<Attachment[]>(
        api().GET('/api/transactions/{transaction_id}/attachments', {
          params: { path: { transaction_id: transactionId } },
        }),
      ),
  })
}

/** After a change: the list, and the transaction lists that show a file count. */
function useInvalidate(transactionId: string) {
  const ws = useWorkspaceKey()
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: listKey(ws, transactionId) })
    void queryClient.invalidateQueries({ queryKey: [ws, 'transactions'] })
  }
}

export function useUploadAttachment(transactionId: string) {
  const invalidate = useInvalidate(transactionId)
  return useMutation({
    mutationFn: async (picked: PickedFile) => {
      const form = new FormData()
      form.append('file', await uploadableFile(picked))
      return unwrap<Attachment>(
        api().POST('/api/transactions/{transaction_id}/attachments', {
          params: { path: { transaction_id: transactionId } },
          // The typed body is the schema's shape; the wire format is the FormData.
          body: {} as never,
          bodySerializer: () => form,
        }),
      )
    },
    onSuccess: invalidate,
  })
}

export function useRenameAttachment(transactionId: string) {
  const invalidate = useInvalidate(transactionId)
  return useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) =>
      unwrap<Attachment>(
        api().PATCH('/api/transactions/{transaction_id}/attachments/{attachment_id}', {
          params: { path: { transaction_id: transactionId, attachment_id: id } },
          body: { filename },
        }),
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteAttachment(transactionId: string) {
  const invalidate = useInvalidate(transactionId)
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api().DELETE('/api/transactions/{transaction_id}/attachments/{attachment_id}', {
          params: { path: { transaction_id: transactionId, attachment_id: id } },
        }),
      ),
    onSuccess: (_data, id) => {
      removeCachedCopy(id)
      invalidate()
    },
  })
}

function cacheDirectory(attachmentId: string): Directory {
  return new Directory(Paths.cache, 'attachments', attachmentId)
}

function removeCachedCopy(attachmentId: string) {
  try {
    const directory = cacheDirectory(attachmentId)
    if (directory.exists) directory.delete()
  } catch {
    // A stale cache file is harmless; it is overwritten on the next download.
  }
}

/**
 * The attachment's bytes as a local file (downloaded with the session's auth
 * headers). Each attachment gets its own folder so two files with the same
 * name never overwrite each other, and a copy whose size matches is reused.
 */
export async function downloadAttachment(transactionId: string, attachment: Attachment): Promise<File> {
  const directory = cacheDirectory(attachment.id)
  const name = sanitizeFilename(attachment.filename) ?? 'attachment'
  const file = new File(directory, name)
  if (file.exists && file.size === attachment.size) return file

  const response = await apiFetch(`/api/transactions/${transactionId}/attachments/${attachment.id}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  // A rename leaves the old name behind; start the folder afresh.
  if (directory.exists) directory.delete()
  directory.create({ intermediates: true })
  file.create()
  file.write(bytes)
  return file
}

/** A local copy for showing an image inline; `null` while it loads or for non-images. */
export function useAttachmentFile(transactionId: string, attachment: Attachment, enabled: boolean) {
  const ws = useWorkspaceKey()
  return useQuery({
    queryKey: [...listKey(ws, transactionId), 'file', attachment.id, attachment.filename, attachment.size],
    queryFn: async () => (await downloadAttachment(transactionId, attachment)).uri,
    enabled,
    staleTime: Infinity,
    retry: false,
  })
}
