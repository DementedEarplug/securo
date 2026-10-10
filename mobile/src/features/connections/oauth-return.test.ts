import { parseOAuthReturn } from './oauth-return'

describe('parseOAuthReturn', () => {
  it('extracts the code and state from the callback', () => {
    expect(parseOAuthReturn('https://securo.example.com/oauth/callback?code=abc%2F1&state=xyz')).toEqual({
      kind: 'code',
      code: 'abc/1',
      state: 'xyz',
    })
  })

  it('accepts the legacy route and a sub-path deployment', () => {
    expect(parseOAuthReturn('https://example.com/securo/enable-banking?code=c&state=s')).toMatchObject({ code: 'c' })
  })

  it('reports a refusal at the bank', () => {
    expect(
      parseOAuthReturn('https://securo.example.com/oauth/callback?error=access_denied&error_description=User+cancelled'),
    ).toEqual({ kind: 'error', error: 'access_denied', description: 'User cancelled' })
  })

  it('ignores the bank pages on the way', () => {
    expect(parseOAuthReturn('https://bank.example.com/login?code=not-ours')).toBeNull()
    expect(parseOAuthReturn('https://securo.example.com/oauth/callback')).toBeNull()
  })
})
