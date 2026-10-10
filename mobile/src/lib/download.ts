import { Directory, File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

import { apiFetch } from '@/api/client'

/** The file name a `Content-Disposition` header suggests, if any. */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const encoded = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header)
  if (encoded?.[1]) {
    try {
      return sanitizeFilename(decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, '')))
    } catch {
      // Malformed escapes: fall through to the plain parameter.
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header)
  const name = plain?.[2] ?? plain?.[1]
  return name ? sanitizeFilename(name.trim()) : null
}

/** Keep a server-suggested name inside the downloads folder. */
export function sanitizeFilename(name: string): string | null {
  const base = name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f]/g, '').trim() ?? ''
  return base && base !== '.' && base !== '..' ? base : null
}

/**
 * Download an API file (with the session's auth headers) into the app's cache
 * and return it. The name comes from `Content-Disposition`, else `fallbackName`.
 */
export async function downloadToCache(
  path: string,
  fallbackName: string,
  init?: RequestInit,
): Promise<{ file: File; mimeType: string | null }> {
  const response = await apiFetch(path, init)
  const name = filenameFromDisposition(response.headers.get('content-disposition')) ?? fallbackName
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || null
  const bytes = new Uint8Array(await response.arrayBuffer())
  const directory = new Directory(Paths.cache, 'downloads')
  if (!directory.exists) directory.create({ intermediates: true })
  const file = new File(directory, name)
  if (file.exists) file.delete()
  file.create()
  file.write(bytes)
  return { file, mimeType }
}

/** Hand a downloaded file to Android's share sheet (save to Drive, open in a viewer, ...). */
export async function shareFile(file: File, mimeType: string | null, dialogTitle?: string): Promise<void> {
  await Sharing.shareAsync(file.uri, { mimeType: mimeType ?? undefined, dialogTitle })
}
