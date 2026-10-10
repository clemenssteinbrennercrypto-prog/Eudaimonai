/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminConsole from './AdminConsole'

afterEach(cleanup)

const session = { user: { id: 'u-admin', email: 'founder@example.com' } }
const capacity = { capacity: 20, max_lifetime_capacity: 50, invitations_paused: false, lifetime_allocated: 1, reserved: 1, remaining: 18 }
const people = [
  { email: 'wait@example.com', user_id: null, state: 'WAITLIST', waitlisted_at: '2026-10-05T10:00:00Z', source: 'reddit', campaign: null, invitation_status: null },
  { email: 'open@example.com', user_id: null, state: 'INVITED', invitation_status: 'live', latest_invitation_id: 'inv-1', invitation_expires_at: '2026-10-08T10:00:00Z' },
  { email: 'beta@example.com', user_id: 'u-beta-1234', state: 'BETA', invitation_status: 'accepted', allocated_at: '2026-10-01T10:00:00Z', beta_entitlement_id: 'ent-1', beta_ends_at: '2099-01-01T00:00:00Z', beta_revoked_at: null },
]

function makeApi(overrides = {}) {
  const ok = data => vi.fn().mockResolvedValue({ data, error: null })
  return {
    configured: true,
    session: vi.fn().mockResolvedValue(session),
    isAdmin: ok(true),
    capacity: ok(capacity),
    people: ok(people),
    auditLog: ok([]),
    invite: ok({ id: 'inv-new' }),
    sendInvitationEmail: ok({ sent: true }),
    revokeInvitation: ok({}),
    extendEntitlement: ok({}),
    revokeEntitlement: ok({}),
    updateConfig: ok({}),
    signOut: ok(null),
    requestCode: ok({}),
    verifyCode: ok({}),
    ...overrides,
  }
}

describe('AdminConsole', () => {
  it('signs in with a code and never creates an account', async () => {
    const api = makeApi({ session: vi.fn().mockResolvedValue(null) })
    render(<AdminConsole api={api} />)
    fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'founder@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await screen.findByText(/8-digit code sent to/)
    expect(api.requestCode).toHaveBeenCalledWith('founder@example.com', { createUser: false })
  })

  it('shows nothing operational to a signed-in non-admin', async () => {
    const api = makeApi({ isAdmin: vi.fn().mockResolvedValue({ data: false, error: null }) })
    render(<AdminConsole api={api} />)
    expect(await screen.findByText('Not an admin')).toBeInTheDocument()
    expect(api.capacity).not.toHaveBeenCalled()
    expect(api.people).not.toHaveBeenCalled()
  })

  it('shows capacity and people for an admin', async () => {
    render(<AdminConsole api={makeApi()} />)
    expect(await screen.findByText('wait@example.com')).toBeInTheDocument()
    expect(screen.getByText('Remaining').nextSibling).toHaveTextContent('18')
    expect(screen.getByText('20 / 50')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invited (1)' })).toBeInTheDocument()
  })

  it('invites, then sends the email, and reports both', async () => {
    const api = makeApi()
    render(<AdminConsole api={api} />)
    const row = (await screen.findByText('wait@example.com')).closest('tr')
    fireEvent.click(within(row).getByRole('button', { name: 'Invite' }))
    expect(await screen.findByText('Invited wait@example.com and sent the email.')).toBeInTheDocument()
    expect(api.invite).toHaveBeenCalledWith('wait@example.com')
    expect(api.sendInvitationEmail).toHaveBeenCalledWith('inv-new')
  })

  it('says when the invitation exists but the email failed', async () => {
    const api = makeApi({ sendInvitationEmail: vi.fn().mockResolvedValue({ data: null, error: 'email_failed' }) })
    render(<AdminConsole api={api} />)
    const row = (await screen.findByText('wait@example.com')).closest('tr')
    fireEvent.click(within(row).getByRole('button', { name: 'Invite' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be sent')
  })

  it('shows the capacity reason when an invite is refused', async () => {
    const api = makeApi({ invite: vi.fn().mockResolvedValue({ data: null, error: 'capacity_exhausted' }) })
    render(<AdminConsole api={api} />)
    fireEvent.change(await screen.findByLabelText('Email to invite'), { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invite and send email' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No beta places left')
    expect(api.sendInvitationEmail).not.toHaveBeenCalled()
  })

  it('asks for confirmation before revoking access', async () => {
    const api = makeApi()
    render(<AdminConsole api={api} />)
    const row = (await screen.findByText('beta@example.com')).closest('tr')
    fireEvent.click(within(row).getByRole('button', { name: 'Revoke' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('nothing on their Mac is deleted')
    expect(api.revokeEntitlement).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke access' }))
    expect(await screen.findByText('Revoked beta access for beta@example.com.')).toBeInTheDocument()
    expect(api.revokeEntitlement).toHaveBeenCalledWith('ent-1', 'Revoked in admin console')
  })

  it('withdraws an open invitation only after confirmation, and extends access', async () => {
    const api = makeApi()
    render(<AdminConsole api={api} />)
    const openRow = (await screen.findByText('open@example.com')).closest('tr')
    fireEvent.click(within(openRow).getByRole('button', { name: 'Withdraw' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Withdraw invitation' }))
    await screen.findByText('Withdrew the invitation for open@example.com.')
    expect(api.revokeInvitation).toHaveBeenCalledWith('inv-1')

    const betaRow = screen.getByText('beta@example.com').closest('tr')
    fireEvent.click(within(betaRow).getByRole('button', { name: '+30 days' }))
    await screen.findByText('Extended beta@example.com by 30 days.')
    expect(api.extendEntitlement).toHaveBeenCalledWith('ent-1', 30)
  })

  it('pauses invitations and saves capacity through the config function', async () => {
    const api = makeApi()
    render(<AdminConsole api={api} />)
    await screen.findByText('wait@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Pause invitations' }))
    await screen.findByText('Invitations paused.')
    expect(api.updateConfig).toHaveBeenCalledWith({ invitationsPaused: true })
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save capacity' }))
    await screen.findByText('Capacity set to 25.')
    expect(api.updateConfig).toHaveBeenCalledWith({ capacity: 25 })
  })
})
