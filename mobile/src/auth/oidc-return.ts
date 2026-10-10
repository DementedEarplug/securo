/** True for the URL the browser lands on at the end of SSO (any form expo-router may hand us). */
export function isOidcReturn(url: string): boolean {
  return /^(securo:\/\/|\/)?oidc(?:[/?#]|$)/i.test(url)
}
