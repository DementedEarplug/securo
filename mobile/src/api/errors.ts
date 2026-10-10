/** A non-2xx API response, with the backend's `detail` when it sent one. */
export class ApiError extends Error {
  readonly status: number
  readonly detail: string | null
  /** Machine-readable code some endpoints send as `detail.code`. */
  readonly code: string | null
  /** Where the user can fix the problem (`detail.help_url`), e.g. a bank portal. */
  readonly helpUrl: string | null

  constructor(status: number, detail: string | null, code: string | null = null, helpUrl: string | null = null) {
    super(detail ?? `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.code = code
    this.helpUrl = helpUrl
  }

  static async from(response: Response, body?: unknown): Promise<ApiError> {
    const detail = extractDetail(body)
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'))
      return new RateLimitedError(detail, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60)
    }
    const structured = structuredDetail(body)
    return new ApiError(response.status, detail, structured.code, structured.helpUrl)
  }
}

/** Too many attempts; the backend says when to try again (`Retry-After`). */
export class RateLimitedError extends ApiError {
  readonly retryAfterSeconds: number

  constructor(detail: string | null, retryAfterSeconds: number) {
    super(429, detail)
    this.name = 'RateLimitedError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** The server could not be reached at all (DNS, TLS, offline, timeout). */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Network request failed')
    this.name = 'NetworkError'
    this.cause = cause
  }
}

function extractDetail(body: unknown): string | null {
  if (body && typeof body === 'object' && 'detail' in body) {
    const { detail } = body as { detail: unknown }
    if (typeof detail === 'string') return detail
    // FastAPI validation errors: [{ loc, msg, type }, ...]
    if (Array.isArray(detail) && detail[0] && typeof detail[0].msg === 'string') {
      return detail[0].msg
    }
    // Structured errors: { code, message, help_url? }
    if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') {
      return detail.message
    }
  }
  return null
}

function structuredDetail(body: unknown): { code: string | null; helpUrl: string | null } {
  const detail = body && typeof body === 'object' && 'detail' in body ? (body as { detail: unknown }).detail : null
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return { code: null, helpUrl: null }
  const { code, help_url: helpUrl } = detail as { code?: unknown; help_url?: unknown }
  return {
    code: typeof code === 'string' ? code : null,
    helpUrl: typeof helpUrl === 'string' ? helpUrl : null,
  }
}

export function isReadOnlyError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403 && error.detail === 'Read-only role'
}
