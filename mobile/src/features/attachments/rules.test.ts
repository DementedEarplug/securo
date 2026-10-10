import {
  checkAttachment,
  DEFAULT_LIMITS,
  fileExtension,
  formatFileSize,
  isPreviewable,
  photoFilename,
  pickerMimeTypes,
  splitName,
} from './rules'

describe('fileExtension / splitName', () => {
  it('reads the last extension, lower-cased', () => {
    expect(fileExtension('Receipt.JPG')).toBe('jpg')
    expect(fileExtension('archive.tar.gz')).toBe('gz')
    expect(fileExtension('README')).toBe('')
    expect(fileExtension('.hidden')).toBe('')
  })

  it('splits a name around its extension', () => {
    expect(splitName('nota fiscal.pdf')).toEqual({ base: 'nota fiscal', extension: 'pdf' })
    expect(splitName('noext')).toEqual({ base: 'noext', extension: '' })
  })
})

describe('checkAttachment', () => {
  const mb = 1024 * 1024

  it('accepts an allowed file within the limits', () => {
    expect(checkAttachment({ name: 'r.pdf', size: 2 * mb }, DEFAULT_LIMITS, 0)).toBeNull()
  })

  it('accepts a file whose size is unknown', () => {
    expect(checkAttachment({ name: 'r.png', size: null }, DEFAULT_LIMITS, 0)).toBeNull()
  })

  it('refuses once the transaction is full', () => {
    expect(checkAttachment({ name: 'r.pdf', size: 1 }, DEFAULT_LIMITS, 10)).toEqual({
      key: 'attachments.maxReached',
      params: { max: 10 },
    })
  })

  it('refuses extensions the server does not allow', () => {
    expect(checkAttachment({ name: 'macro.xlsm', size: 1 }, DEFAULT_LIMITS, 0)?.key).toBe('attachments.typeNotAllowed')
    expect(checkAttachment({ name: 'noext', size: 1 }, DEFAULT_LIMITS, 0)?.key).toBe('attachments.typeNotAllowed')
  })

  it('refuses files over the size limit', () => {
    expect(checkAttachment({ name: 'big.jpg', size: 10 * mb + 1 }, DEFAULT_LIMITS, 0)).toEqual({
      key: 'attachments.tooLarge',
      params: { max: 10 },
    })
    expect(checkAttachment({ name: 'edge.jpg', size: 10 * mb }, DEFAULT_LIMITS, 0)).toBeNull()
  })

  it('follows the server limits', () => {
    const limits = { allowed_extensions: ['CSV'], max_file_size_mb: 1, max_attachments_per_transaction: 2 }
    expect(checkAttachment({ name: 'a.csv', size: 10 }, limits, 1)).toBeNull()
    expect(checkAttachment({ name: 'a.pdf', size: 10 }, limits, 1)?.key).toBe('attachments.typeNotAllowed')
  })
})

describe('pickerMimeTypes', () => {
  it('maps the default extensions to unique MIME types', () => {
    expect(pickerMimeTypes(DEFAULT_LIMITS)).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      'application/pdf',
    ])
  })

  it('falls back to any file when an extension has no known type', () => {
    expect(pickerMimeTypes({ ...DEFAULT_LIMITS, allowed_extensions: ['pdf', 'dwg'] })).toEqual(['*/*'])
  })
})

describe('formatFileSize', () => {
  it('uses B, KB and MB', () => {
    expect(formatFileSize(512, 'en-US')).toBe('512 B')
    expect(formatFileSize(48 * 1024, 'en-US')).toBe('48 KB')
    expect(formatFileSize(2.45 * 1024 * 1024, 'en-US')).toBe('2.5 MB')
    expect(formatFileSize(2.45 * 1024 * 1024, 'pt-BR')).toBe('2,5 MB')
  })
})

describe('photoFilename', () => {
  const now = new Date(2026, 9, 9, 8, 5, 3)

  it('keeps a real file name', () => {
    expect(photoFilename({ fileName: 'IMG_1234.jpg', uri: 'file:///x' }, now)).toBe('IMG_1234.jpg')
  })

  it('names camera shots by date with an extension from the MIME type', () => {
    expect(photoFilename({ fileName: null, mimeType: 'image/jpeg', uri: 'file:///cache/abc' }, now)).toBe('photo-20261009-080503.jpg')
    expect(photoFilename({ fileName: 'abc', mimeType: 'image/png', uri: 'file:///cache/abc' }, now)).toBe('photo-20261009-080503.png')
  })

  it('falls back to the URI extension, then jpg', () => {
    expect(photoFilename({ uri: 'file:///cache/shot.webp' }, now)).toBe('photo-20261009-080503.webp')
    expect(photoFilename({ uri: 'file:///cache/shot' }, now)).toBe('photo-20261009-080503.jpg')
  })
})

describe('isPreviewable', () => {
  it('only draws formats Android renders', () => {
    expect(isPreviewable('image/jpeg')).toBe(true)
    expect(isPreviewable('image/heic')).toBe(false)
    expect(isPreviewable('application/pdf')).toBe(false)
  })
})
