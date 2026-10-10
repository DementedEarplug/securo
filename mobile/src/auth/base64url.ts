const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** Unpadded base64url (RFC 4648 §5), the encoding PKCE and WebAuthn JSON use. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    out += ALPHABET[a >> 2]
    out += ALPHABET[((a & 3) << 4) | (b >> 4)]
    if (i + 1 < bytes.length) out += ALPHABET[((b & 15) << 2) | (c >> 6)]
    if (i + 2 < bytes.length) out += ALPHABET[c & 63]
  }
  return out
}

/**
 * Normalize standard or padded base64 to unpadded base64url. The server stores
 * credential ids unpadded and compares them as strings, so a stray `=` or `+`
 * from a credential provider would read as an unknown passkey.
 */
export function toBase64Url(value: string): string {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
