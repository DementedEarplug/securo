import { filenameFromDisposition, sanitizeFilename } from './download'

describe('filenameFromDisposition', () => {
  it('reads quoted and bare names', () => {
    expect(filenameFromDisposition('attachment; filename="report.csv"')).toBe('report.csv')
    expect(filenameFromDisposition('attachment; filename=backup.zip')).toBe('backup.zip')
  })

  it('prefers the RFC 5987 encoded name', () => {
    expect(filenameFromDisposition("attachment; filename=\"a.pdf\"; filename*=UTF-8''fatura%20n%C2%BA1.pdf")).toBe('fatura nº1.pdf')
  })

  it('returns null without a header or name', () => {
    expect(filenameFromDisposition(null)).toBeNull()
    expect(filenameFromDisposition('inline')).toBeNull()
  })

  it('never escapes the downloads folder', () => {
    expect(filenameFromDisposition('attachment; filename="../../secret.txt"')).toBe('secret.txt')
    expect(sanitizeFilename('..')).toBeNull()
  })
})
