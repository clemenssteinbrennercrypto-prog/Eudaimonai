import { useCallback, useEffect, useMemo, useState } from 'react'
import WebShell from './WebShell'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatDateTime } from './format'

// Operator console for the closed beta. Visibility here is convenience only:
// every read is filtered by RLS and every action is a database function that
// re-checks admin membership, so a non-admin who reaches this page or calls
// the same endpoints directly gets nothing.

const MESSAGES = {
  capacity_exhausted: 'No beta places left. Raise the capacity or wait for open invitations to expire.',
  invitations_paused: 'Invitations are paused. Resume them to invite.',
  already_invited: 'This address already has an open invitation.',
  already_activated: 'This address has already used its free beta place.',
  invalid_email: 'That doesn’t look like a complete email address.',
  capacity_below_lifetime_allocations: 'Capacity can’t go below the places already used.',
  invitation_not_revocable: 'This invitation is no longer open.',
  entitlement_not_revocable: 'This access is already revoked.',
  entitlement_revoked: 'Revoked access can’t be extended.',
  entitlement_not_extendable: 'This access can’t be extended here.',
  invitation_not_live: 'This invitation is no longer open, so no email was sent.',
  email_failed: 'The invitation exists, but the email could not be sent. Try “Resend email”.',
  not_authorized: 'This account is not an admin.',
  not_authenticated: 'Your session has ended. Sign in again.',
  code_invalid: 'That code is wrong or has expired.',
  no_account: 'There is no account for this address.',
  rate_limited: 'Too many attempts. Please wait a minute.',
  network: 'We couldn’t reach the server. Check your connection.',
  unknown: 'Something went wrong. Please try again.',
}
const message = code => MESSAGES[code] ?? MESSAGES.unknown

const FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'WAITLIST', label: 'Waitlist' },
  { id: 'INVITED', label: 'Invited' },
  { id: 'BETA', label: 'Beta' },
  { id: 'LAPSED', label: 'Lapsed' },
  { id: 'INTERNAL', label: 'Internal' },
]

export default function AdminConsole({ api }) {
  const [phase, setPhase] = useState('checking')
  const [user, setUser] = useState(null)

  const checkSession = useCallback(async () => {
    const session = await api.session()
    if (!session) {
      setPhase('signed_out')
      return
    }
    const admin = await api.isAdmin(session.user.id)
    setUser(session.user)
    setPhase(admin.data ? 'admin' : 'not_admin')
  }, [api])

  useEffect(() => {
    if (!api?.configured) return
    checkSession()
  }, [api, checkSession])

  if (!api?.configured) {
    return (
      <WebShell>
        <h1 className="web-title">Admin</h1>
        <p className="web-lead">The beta backend is not configured for this build.</p>
      </WebShell>
    )
  }

  const signOut = async () => {
    await api.signOut()
    setUser(null)
    setPhase('signed_out')
  }

  if (phase === 'checking') {
    return <WebShell><p className="web-lead">Checking your session…</p></WebShell>
  }
  if (phase === 'signed_out') {
    return <AdminSignIn api={api} onSignedIn={checkSession} />
  }
  if (phase === 'not_admin') {
    return (
      <WebShell>
        <h1 className="web-title">Not an admin</h1>
        <p className="web-lead">{user?.email} is signed in but has no admin rights.</p>
        <button className="web-button is-secondary" type="button" onClick={signOut}>Sign out</button>
      </WebShell>
    )
  }
  return <AdminDashboard api={api} user={user} onSignOut={signOut} />
}

function AdminSignIn({ api, onSignedIn }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const request = async event => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    // Never creates an account: admins already exist.
    const result = await api.requestCode(email.trim(), { createUser: false })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setStep('code')
  }

  const verify = async event => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await api.verifyCode(email.trim(), code.trim())
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onSignedIn()
  }

  return (
    <WebShell note="Admin">
      <h1 className="web-title">Admin sign-in</h1>
      {step === 'email' ? (
        <form className="web-card" onSubmit={request}>
          <label className="web-field">
            Email address
            <input className="web-input" type="email" autoComplete="email" required value={email}
              onChange={event => setEmail(event.target.value)} disabled={busy} />
          </label>
          <button className="web-button" type="submit" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send code'}</button>
          {error && <p className="web-message is-error" role="alert">{message(error)}</p>}
        </form>
      ) : (
        <form className="web-card" onSubmit={verify}>
          <label className="web-field">
            8-digit code sent to {email.trim()}
            <input className="web-input is-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required
              value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))} disabled={busy} />
          </label>
          <button className="web-button" type="submit" disabled={busy || code.length !== 8}>{busy ? 'Checking…' : 'Sign in'}</button>
          {error && <p className="web-message is-error" role="alert">{message(error)}</p>}
        </form>
      )}
    </WebShell>
  )
}

function invitationLabel(person) {
  if (!person.invitation_status) return '—'
  if (person.invitation_status === 'live') return `Open until ${formatDateTime(person.invitation_expires_at)}`
  return { accepted: 'Accepted', revoked: 'Withdrawn', expired: 'Expired' }[person.invitation_status]
}

function accessLabel(person) {
  if (!person.beta_entitlement_id) return '—'
  if (person.beta_revoked_at) return 'Revoked'
  const ends = new Date(person.beta_ends_at)
  return `${ends > new Date() ? 'Until' : 'Ended'} ${formatDateTime(person.beta_ends_at)}`
}

function AdminDashboard({ api, user, onSignOut }) {
  const [capacity, setCapacity] = useState(null)
  const [people, setPeople] = useState([])
  const [activity, setActivity] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [inviteEmail, setInviteEmail] = useState('')
  const [capacityDraft, setCapacityDraft] = useState('')
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(async (query = search) => {
    const [cap, list, log] = await Promise.all([api.capacity(), api.people(query.trim()), api.auditLog(20)])
    if (cap.error || list.error) {
      setNotice({ kind: 'error', text: message(cap.error ?? list.error) })
      return
    }
    setCapacity(cap.data)
    setCapacityDraft(String(cap.data?.capacity ?? ''))
    setPeople(list.data ?? [])
    setActivity(log.data ?? [])
  }, [api, search])

  useEffect(() => {
    const timer = setTimeout(() => load(search), 250)
    return () => clearTimeout(timer)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (action, success) => {
    setBusy(true)
    setNotice(null)
    const result = await action()
    setBusy(false)
    if (result?.error) {
      setNotice({ kind: 'error', text: message(result.error) })
    } else if (success) {
      setNotice({ kind: 'success', text: typeof success === 'function' ? success(result) : success })
    }
    await load()
    return result
  }

  const inviteAndEmail = async email => {
    const created = await api.invite(email)
    if (created.error) return created
    const sent = await api.sendInvitationEmail(created.data.id)
    if (sent.error) return { error: sent.error === 'invitation_not_live' ? sent.error : 'email_failed' }
    return created
  }

  const invite = event => {
    event?.preventDefault()
    const email = inviteEmail.trim()
    run(() => inviteAndEmail(email), `Invited ${email} and sent the email.`).then(result => {
      if (!result?.error) setInviteEmail('')
    })
  }

  const filtered = useMemo(
    () => (filter === 'ALL' ? people : people.filter(person => person.state === filter)),
    [people, filter],
  )

  const capacityNumber = Number(capacityDraft)
  const capacityValid = Number.isInteger(capacityNumber) && capacityNumber >= 0 && capacityNumber <= (capacity?.max_lifetime_capacity ?? 50)

  return (
    <WebShell wide note={user?.email}>
      <div className="admin-bar">
        <h1>
          Beta admin
          {import.meta.env.VITE_BETA_ENVIRONMENT && <span className="admin-env">{import.meta.env.VITE_BETA_ENVIRONMENT}</span>}
        </h1>
        <div className="web-actions" style={{ marginTop: 0 }}>
          <button className="web-button is-secondary is-small" type="button" onClick={() => load()} disabled={busy}>Refresh</button>
          <button className="web-button is-secondary is-small" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      {notice && (
        <p className={`web-message ${notice.kind === 'error' ? 'is-error' : 'is-success'}`} role={notice.kind === 'error' ? 'alert' : 'status'} style={{ marginTop: 0, marginBottom: 16 }}>
          {notice.text}
        </p>
      )}

      <section className="web-card" aria-label="Beta capacity">
        <div className="admin-metrics">
          <Metric label="Remaining" value={capacity?.remaining} />
          <Metric label="Reserved (open invites)" value={capacity?.reserved} />
          <Metric label="Used for good" value={capacity?.lifetime_allocated} />
          <Metric label="Capacity" value={capacity ? `${capacity.capacity} / ${capacity.max_lifetime_capacity}` : '—'} />
        </div>
        <div className="admin-controls">
          <label className="web-field">
            Capacity
            <input className="web-input" type="number" min={0} max={capacity?.max_lifetime_capacity ?? 50} value={capacityDraft}
              onChange={event => setCapacityDraft(event.target.value)} disabled={busy} />
          </label>
          <button className="web-button is-secondary" type="button" disabled={busy || !capacityValid || capacityNumber === capacity?.capacity}
            onClick={() => run(() => api.updateConfig({ capacity: capacityNumber }), `Capacity set to ${capacityNumber}.`)}>
            Save capacity
          </button>
          <button className={`web-button ${capacity?.invitations_paused ? '' : 'is-secondary'}`} type="button" disabled={busy || !capacity}
            onClick={() => run(
              () => api.updateConfig({ invitationsPaused: !capacity.invitations_paused }),
              capacity.invitations_paused ? 'Invitations resumed.' : 'Invitations paused.',
            )}>
            {capacity?.invitations_paused ? 'Resume invitations' : 'Pause invitations'}
          </button>
          {capacity?.invitations_paused && <span className="admin-state is-LAPSED">Invitations paused</span>}
        </div>
      </section>

      <h2 className="web-section-title">Invite someone</h2>
      <form className="admin-invite" onSubmit={invite}>
        <input className="web-input" type="email" placeholder="email@example.com" aria-label="Email to invite"
          value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} disabled={busy} />
        <button className="web-button" type="submit" disabled={busy || !inviteEmail.trim()}>Invite and send email</button>
      </form>
      <p className="web-note">Reserves one place for 72 hours. Activation grants 30 days of beta access.</p>

      <h2 className="web-section-title">People</h2>
      <div className="admin-toolbar">
        <input className="web-input" type="search" placeholder="Search email or user ID" aria-label="Search people"
          value={search} onChange={event => setSearch(event.target.value)} />
        <div className="admin-filters" role="group" aria-label="Filter by state">
          {FILTERS.map(option => (
            <button key={option.id} type="button" aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>
              {option.label} ({option.id === 'ALL' ? people.length : people.filter(person => person.state === option.id).length})
            </button>
          ))}
        </div>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>State</th>
              <th>Waitlist</th>
              <th>Invitation</th>
              <th>Beta access</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="admin-empty">Nobody here yet.</td></tr>
            )}
            {filtered.map(person => (
              <tr key={person.email}>
                <td>{person.email}{person.user_id && <small>{person.user_id.slice(0, 8)}</small>}</td>
                <td><span className={`admin-state is-${person.state}`}>{person.state}</span></td>
                <td>{person.waitlisted_at ? formatDateTime(person.waitlisted_at) : '—'}{person.source && <small>{[person.source, person.campaign].filter(Boolean).join(' · ')}</small>}</td>
                <td>{invitationLabel(person)}</td>
                <td>{accessLabel(person)}{person.allocated_at && <small>Activated {formatDateTime(person.allocated_at)}</small>}</td>
                <td><RowActions person={person} busy={busy} run={run} api={api} inviteAndEmail={inviteAndEmail} setConfirm={setConfirm} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="web-section-title">Recent activity</h2>
      {activity.length === 0 ? <p className="web-note">No admin activity yet.</p> : (
        <ul className="admin-activity">
          {activity.map(entry => (
            <li key={entry.id}>
              <span>{entry.action.replaceAll('_', ' ')} <small style={{ color: 'rgba(255,255,255,0.45)' }}>{entry.target_type} {entry.target_id?.slice(0, 8)}</small></span>
              <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
            </li>
          ))}
        </ul>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await run(confirm.action, confirm.success)
            setConfirm(null)
          }}
        />
      )}
    </WebShell>
  )
}

function Metric({ label, value }) {
  return (
    <div className="admin-metric">
      <span>{label}</span>
      <strong>{value ?? '—'}</strong>
    </div>
  )
}

function RowActions({ person, busy, run, api, inviteAndEmail, setConfirm }) {
  const canInvite = !person.allocated_at && person.invitation_status !== 'live' && person.state !== 'INTERNAL'
  const openInvite = person.invitation_status === 'live'
  const accessActive = person.beta_entitlement_id && !person.beta_revoked_at
  return (
    <div className="admin-row-actions">
      {canInvite && (
        <button className="web-button is-small" type="button" disabled={busy}
          onClick={() => run(() => inviteAndEmail(person.email), `Invited ${person.email} and sent the email.`)}>
          Invite
        </button>
      )}
      {openInvite && (
        <>
          <button className="web-button is-secondary is-small" type="button" disabled={busy}
            onClick={() => run(() => api.sendInvitationEmail(person.latest_invitation_id), `Sent the invitation to ${person.email} again.`)}>
            Resend email
          </button>
          <button className="web-button is-danger is-small" type="button" disabled={busy}
            onClick={() => setConfirm({
              title: 'Withdraw this invitation?',
              description: `${person.email} won’t be able to activate it. The reserved place becomes free again.`,
              confirmLabel: 'Withdraw invitation',
              action: () => api.revokeInvitation(person.latest_invitation_id),
              success: `Withdrew the invitation for ${person.email}.`,
            })}>
            Withdraw
          </button>
        </>
      )}
      {accessActive && (
        <>
          {[7, 30].map(days => (
            <button key={days} className="web-button is-secondary is-small" type="button" disabled={busy}
              onClick={() => run(() => api.extendEntitlement(person.beta_entitlement_id, days), `Extended ${person.email} by ${days} days.`)}>
              +{days} days
            </button>
          ))}
          <button className="web-button is-danger is-small" type="button" disabled={busy}
            onClick={() => setConfirm({
              title: 'Revoke beta access?',
              description: `${person.email} loses access to the beta now. Their place stays used, and nothing on their Mac is deleted.`,
              confirmLabel: 'Revoke access',
              action: () => api.revokeEntitlement(person.beta_entitlement_id, 'Revoked in admin console'),
              success: `Revoked beta access for ${person.email}.`,
            })}>
            Revoke
          </button>
        </>
      )}
    </div>
  )
}
