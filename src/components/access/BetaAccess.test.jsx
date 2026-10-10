/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BetaAccess from './BetaAccess'

afterEach(cleanup)

const signedOut = { phase: 'signed_out', mayStartSessions: false, signedIn: false }

function makeAccess(status, overrides = {}) {
  const ok = next => vi.fn().mockResolvedValue({ status: next, error: null })
  return {
    native: true,
    status,
    requestAccess: ok({ ...signedOut, phase: 'waitlist_pending', waitlistPending: true, email: 'friend@example.com' }),
    sendCode: ok(status),
    verifyCode: ok({ phase: 'active', mayStartSessions: true }),
    check: ok(status),
    signOut: ok(signedOut),
    forgetPending: ok(signedOut),
    ...overrides,
  }
}

describe('BetaAccess — new user', () => {
  it('offers both ways in', () => {
    render(<BetaAccess access={makeAccess(signedOut)} />)
    expect(screen.getByRole('button', { name: 'Request beta access' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'I already have access' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View my history' })).not.toBeInTheDocument()
  })

  it('requests beta access with an email', async () => {
    const access = makeAccess(signedOut)
    render(<BetaAccess access={access} />)
    fireEvent.click(screen.getByRole('button', { name: 'Request beta access' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'friend@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Request access' }))
    await vi.waitFor(() => expect(access.requestAccess).toHaveBeenCalledWith('friend@example.com'))
  })

  it('signs in with an emailed 8-digit code and continues when access is confirmed', async () => {
    const onContinue = vi.fn()
    const access = makeAccess(signedOut)
    const { rerender } = render(<BetaAccess access={access} onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: 'I already have access' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'friend@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByText(/We sent an 8-digit code to friend@example.com/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '1234-5678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await vi.waitFor(() => expect(access.verifyCode).toHaveBeenCalledWith('friend@example.com', '12345678'))
    rerender(<BetaAccess access={{ ...access, status: { phase: 'active', mayStartSessions: true } }} onContinue={onContinue} />)
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('explains a missing invitation and points to the request', async () => {
    const access = makeAccess(signedOut, { sendCode: vi.fn().mockResolvedValue({ status: null, error: 'not_invited' }) })
    render(<BetaAccess access={access} />)
    fireEvent.click(screen.getByRole('button', { name: 'I already have access' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'stranger@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no invitation for this address yet')
    expect(screen.getByRole('button', { name: 'Request beta access' })).toBeInTheDocument()
  })

  it('keeps the code step on a wrong code, with a fixed message', async () => {
    const access = makeAccess(signedOut, { verifyCode: vi.fn().mockResolvedValue({ status: null, error: 'code_invalid' }) })
    render(<BetaAccess access={access} />)
    fireEvent.click(screen.getByRole('button', { name: 'I already have access' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'friend@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    fireEvent.change(await screen.findByLabelText('Code'), { target: { value: '00000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('wrong or has expired')
    expect(screen.getByRole('button', { name: /New code in/ })).toBeDisabled()
  })

  it('lets an existing install view its history without signing in', () => {
    const onViewHistory = vi.fn()
    render(<BetaAccess access={makeAccess(signedOut)} hasHistory onViewHistory={onViewHistory} />)
    fireEvent.click(screen.getByRole('button', { name: 'View my history' }))
    expect(onViewHistory).toHaveBeenCalled()
  })
})

describe('BetaAccess — waitlist', () => {
  const pending = { phase: 'waitlist_pending', mayStartSessions: false, signedIn: false, waitlistPending: true, email: 'friend@example.com' }

  it('shows the pending state; "Check again" says not yet when there is no invitation', async () => {
    const access = makeAccess(pending, { sendCode: vi.fn().mockResolvedValue({ status: null, error: 'not_invited' }) })
    render(<BetaAccess access={access} />)
    expect(screen.getByText(/We’ll email friend@example.com when your place is ready/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Not yet')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('moves straight to the code once an invitation exists', async () => {
    const access = makeAccess(pending)
    render(<BetaAccess access={access} />)
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByLabelText('Code')).toBeInTheDocument()
    expect(access.sendCode).toHaveBeenCalledWith('friend@example.com')
  })

  it('can change the email', async () => {
    const access = makeAccess(pending)
    render(<BetaAccess access={access} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change email' }))
    await vi.waitFor(() => expect(access.forgetPending).toHaveBeenCalled())
  })
})

describe('BetaAccess — no current access', () => {
  it('lapsed: blocks sessions, says history is kept, offers history, check and sign out', () => {
    const access = makeAccess({ phase: 'lapsed', mayStartSessions: false, signedIn: true, state: 'LAPSED' })
    render(<BetaAccess access={access} hasHistory onViewHistory={() => {}} />)
    expect(screen.getByRole('heading')).toHaveTextContent('Your beta access has ended')
    expect(screen.getByText(/Nothing has been deleted/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View my history' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(access.check).toHaveBeenCalled()
  })

  it('no access: the signed-in account can request a place', async () => {
    const access = makeAccess({ phase: 'no_access', mayStartSessions: false, signedIn: true, email: 'acct@example.com' })
    render(<BetaAccess access={access} />)
    fireEvent.click(screen.getByRole('button', { name: 'Request beta access' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Request sent')
    expect(access.requestAccess).toHaveBeenCalledWith('acct@example.com')
  })

  it('network error: offers a retry, never shows server text', async () => {
    const access = makeAccess({ phase: 'network_error', mayStartSessions: false, signedIn: true }, {
      check: vi.fn().mockResolvedValue({ status: null, error: 'network' }),
    })
    render(<BetaAccess access={access} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('can’t reach the server')
  })

  it('a rewound clock is explained', () => {
    render(<BetaAccess access={makeAccess({ phase: 'needs_check', mayStartSessions: false, signedIn: true, denial: 'clock_rollback' })} />)
    expect(screen.getByText(/clock was set back/)).toBeInTheDocument()
  })

  it('signing out goes back to the start', async () => {
    const access = makeAccess({ phase: 'lapsed', mayStartSessions: false, signedIn: true })
    render(<BetaAccess access={access} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await vi.waitFor(() => expect(access.signOut).toHaveBeenCalled())
  })
})
