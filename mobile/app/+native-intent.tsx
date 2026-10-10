import { isOidcReturn } from '@/auth/oidc-return'

/**
 * Deep links the router should not treat as screens. The browser tab used for
 * single sign-on ends on `securo://oidc?code=...`; `openAuthSessionAsync`
 * reads that URL itself, so the router must not also navigate to it.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    // A cold start from that link (the app was killed meanwhile) has no
    // sign-in waiting for it: just open the app.
    if (isOidcReturn(path)) return initial ? '/' : null
    return path
  } catch {
    return path
  }
}
