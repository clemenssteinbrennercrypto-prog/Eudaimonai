/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ActivatePage from './ActivatePage'

afterEach(cleanup)

function makeApi(overrides = {}) {
  return {
    configured: true,
    requestCode: vi.fn().mockResolvedValue({ data: {}, error: null }),
    verifyCode: vi.fn().mockResolvedValue({ data: {}, error: null }),
    claimInvitation: vi.fn().mockResolvedValue({ data: { ends_at: '2026-11-04T10:00:00Z' }, error: null }),
    myAccess: vi.fn().mockResolvedValue({ data: { has_access: false }, error: null }),
    signOut: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
}

async function throughCode(api) {
  render(<ActivatePage api={api} search="?email=friend%40example.com" />)
  expect(screen.getByDisplayValue('friend@example.com')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
  await screen.findByText('Check your email')
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: '1234 5678' } })
  fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
}

describe('ActivatePage', () => {
  it('activates: code → claim → sign out → download', async () => {
    const api = makeApi()
    await throughCode(api)
    expect(await screen.findByText('You’re in.')).toBeInTheDocument()
    expect(screen.getByText('4 November 2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Download Eudaimonai' })).toHaveAttribute('href', '/download')
    expect(api.requestCode).toHaveBeenCalledWith('friend@example.com', { createUser: true })
    expect(api.verifyCode).toHaveBeenCalledWith('friend@example.com', '12345678')
    expect(api.signOut).toHaveBeenCalledTimes(1)
  })

  it('explains a missing invitation without creating anything', async () => {
    const api = makeApi({ requestCode: vi.fn().mockResolvedValue({ data: null, error: 'not_invited' }) })
    render(<ActivatePage api={api} search="?email=stranger%40example.com" />)
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no open invitation')
    expect(api.verifyCode).not.toHaveBeenCalled()
  })

  it('keeps the code step on a wrong or expired code', async () => {
    const api = makeApi({ verifyCode: vi.fn().mockResolvedValue({ data: null, error: 'code_invalid' }) })
    await throughCode(api)
    expect(await screen.findByRole('alert')).toHaveTextContent('wrong or has expired')
    expect(api.claimInvitation).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /New code in/ })).toBeDisabled()
  })

  it('treats existing access as success (already activated or internal)', async () => {
    const api = makeApi({
      claimInvitation: vi.fn().mockResolvedValue({ data: null, error: 'already_activated' }),
      myAccess: vi.fn().mockResolvedValue({ data: { has_access: true, access_until: null }, error: null }),
    })
    await throughCode(api)
    expect(await screen.findByText('Your access is already active.')).toBeInTheDocument()
    expect(screen.getByText(/no end date/)).toBeInTheDocument()
    expect(api.signOut).toHaveBeenCalled()
  })

  it('says when the free place was already used and has ended', async () => {
    const api = makeApi({ claimInvitation: vi.fn().mockResolvedValue({ data: null, error: 'already_activated' }) })
    await throughCode(api)
    expect(await screen.findByText('This beta place has been used')).toBeInTheDocument()
    expect(api.signOut).toHaveBeenCalled()
  })

  it('says when the invitation expired or was withdrawn', async () => {
    const api = makeApi({ claimInvitation: vi.fn().mockResolvedValue({ data: null, error: 'no_valid_invitation' }) })
    await throughCode(api)
    expect(await screen.findByText('This invitation is no longer open')).toBeInTheDocument()
    expect(api.signOut).toHaveBeenCalled()
  })
})
