import { ApiError } from './errors'

const response = (status: number) => new Response(null, { status })

describe('ApiError.from', () => {
  it('reads a plain string detail', async () => {
    const error = await ApiError.from(response(400), { detail: 'Invalid 2FA code' })
    expect(error).toMatchObject({ status: 400, detail: 'Invalid 2FA code', code: null })
  })

  it('reads structured details with a code and help link', async () => {
    const error = await ApiError.from(response(409), {
      detail: { code: 'no_accounts_linked', message: 'Link accounts in the portal', help_url: 'https://example.com' },
    })
    expect(error).toMatchObject({
      detail: 'Link accounts in the portal',
      code: 'no_accounts_linked',
      helpUrl: 'https://example.com',
    })
  })

  it('reads the first validation message', async () => {
    const error = await ApiError.from(response(422), { detail: [{ msg: 'field required', loc: ['body', 'x'] }] })
    expect(error.detail).toBe('field required')
  })
})
