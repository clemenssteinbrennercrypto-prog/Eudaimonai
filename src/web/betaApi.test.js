import { describe, expect, it, vi } from 'vitest'
import { createBetaApi, errorCode } from './betaApi'

describe('errorCode', () => {
  it('maps database exceptions to their stable code', () => {
    expect(errorCode({ code: 'P0001', message: 'capacity_exhausted', details: 'used 20 of 20' })).toBe('capacity_exhausted')
    expect(errorCode({ code: '42501', message: 'not_authorized' })).toBe('not_authorized')
    expect(errorCode({ code: 'P0001', message: 'rate_limited' })).toBe('rate_limited')
  })

  it('maps Auth responses: invite-only hook, expired code, send limit, unknown account', () => {
    expect(errorCode({ status: 403, message: 'Eudaimonai is invite-only right now. Request access on the website.' })).toBe('not_invited')
    expect(errorCode({ status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' })).toBe('code_invalid')
    expect(errorCode({ status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' })).toBe('rate_limited')
    expect(errorCode({ status: 422, code: 'otp_disabled', message: 'Signups not allowed for otp' })).toBe('no_account')
  })

  it('recognizes network failures and falls back to unknown', () => {
    expect(errorCode(new TypeError('Failed to fetch'))).toBe('network')
    expect(errorCode({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' })).toBe('network')
    // A server error is not the visitor's connection.
    expect(errorCode({ name: 'AuthRetryableFetchError', status: 500, message: '{}' })).toBe('unknown')
    expect(errorCode({ message: 'something new' })).toBe('unknown')
    expect(errorCode(null)).toBe(null)
  })
})

describe('createBetaApi', () => {
  it('asks Auth to create accounts only when told to (activation), never for admin sign-in', async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ data: {}, error: null })
    const api = createBetaApi({ auth: { signInWithOtp } })
    await api.requestCode('a@example.com', { createUser: false })
    expect(signInWithOtp).toHaveBeenCalledWith({ email: 'a@example.com', options: { shouldCreateUser: false } })
  })

  it('reads a function error from the response body', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'invitation_not_live' }) } },
    })
    const api = createBetaApi({ functions: { invoke } })
    expect(await api.sendInvitationEmail('id')).toEqual({ data: null, error: 'invitation_not_live' })
  })

  it('signs out only this browser, not the account everywhere', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null })
    await createBetaApi({ auth: { signOut } }).signOut()
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
