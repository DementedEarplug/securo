/** What this server accepts as attachments (`GET /api/settings/attachments`). */
export interface AttachmentLimits {
  allowed_extensions: string[]
  max_file_size_mb: number
  max_attachments_per_transaction: number
}

/** The backend's defaults, used until the server's own limits load (as the web does). */
export const DEFAULT_LIMITS: AttachmentLimits = {
  allowed_extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'pdf'],
  max_file_size_mb: 10,
  max_attachments_per_transaction: 10,
}

/** Lower-case extension without the dot, or '' when there is none. */
export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

/** A name split around its extension, for renaming only the part users may change. */
export function splitName(filename: string): { base: string; extension: string } {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? { base: filename.slice(0, dot), extension: filename.slice(dot + 1) } : { base: filename, extension: '' }
}

export type AttachmentProblem =
  | { key: 'attachments.maxReached'; params: { max: number } }
  | { key: 'attachments.typeNotAllowed'; params: { allowed: string } }
  | { key: 'attachments.tooLarge'; params: { max: number } }

/**
 * Why the server would refuse this file, checked before uploading so the user
 * isn't made to wait for a large upload the server then rejects. The server
 * stays authoritative; these mirror `attachment_service._validate_file`.
 */
export function checkAttachment(
  file: { name: string; size?: number | null },
  limits: AttachmentLimits,
  currentCount: number,
): AttachmentProblem | null {
  if (currentCount >= limits.max_attachments_per_transaction) {
    return { key: 'attachments.maxReached', params: { max: limits.max_attachments_per_transaction } }
  }
  const allowed = limits.allowed_extensions.map((e) => e.toLowerCase())
  if (!allowed.includes(fileExtension(file.name))) {
    return { key: 'attachments.typeNotAllowed', params: { allowed: allowed.join(', ') } }
  }
  if (file.size != null && file.size > limits.max_file_size_mb * 1024 * 1024) {
    return { key: 'attachments.tooLarge', params: { max: limits.max_file_size_mb } }
  }
  return null
}

/** The allowed extensions as MIME types for the document picker's filter. */
export function pickerMimeTypes(limits: AttachmentLimits): string[] {
  const known: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
    pdf: 'application/pdf',
    csv: 'text/csv',
    txt: 'text/plain',
    xml: 'application/xml',
    zip: 'application/zip',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ofx: 'application/x-ofx',
  }
  const types = limits.allowed_extensions.map((e) => known[e.toLowerCase()])
  // An extension we can't map would be filtered out of the picker; let the
  // user see everything instead and rely on `checkAttachment`.
  if (types.some((t) => !t)) return ['*/*']
  return [...new Set(types as string[])]
}

/** Human-readable size: "512 B", "48 KB", "2.4 MB". */
export function formatFileSize(bytes: number, locale?: string): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  const mb = bytes / (1024 * 1024)
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(mb)} MB`
}

/**
 * A name for a photo. Cameras hand back opaque names (or none); the server
 * needs an extension, and a date reads better in the list.
 */
export function photoFilename(asset: { fileName?: string | null; mimeType?: string | null; uri: string }, now = new Date()): string {
  if (asset.fileName && fileExtension(asset.fileName)) return asset.fileName
  const fromMime = asset.mimeType?.split('/')[1]?.toLowerCase()
  const extension = (fromMime === 'jpeg' ? 'jpg' : fromMime) || fileExtension(asset.uri) || 'jpg'
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `photo-${stamp}.${extension}`
}

/** Images the app can draw itself; anything else (PDF, HEIC) opens in another app. */
export function isPreviewable(contentType: string): boolean {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(contentType.toLowerCase())
}
