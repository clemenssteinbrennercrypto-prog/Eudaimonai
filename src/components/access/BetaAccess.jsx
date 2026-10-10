import { useEffect, useRef, useState } from 'react'
import { accessMessage } from '../../lib/betaAccess'

// The beta access step: request a place, or sign in with an emailed code.
// Rendered inside the onboarding (before the camera slide) and, for
// returning users without access, as its own screen. It only shows what
// Rust reports; Rust decides.
//
// Visual language: the onboarding's — kicker, large title, one paragraph,
// one primary button, quiet text links.

const RESEND_AFTER_SECONDS = 60

const textButton = {
  background: 'none', border: 'none', padding: '2px 6px',
  fontSize: 13, fontWeight: 500, color: 'var(--ds-accent-text)', fontFamily: 'inherit', cursor: 'default',
}

const fieldStyle = {
  width: '100%', height: 46, padding: '0 14px', borderRadius: 10,
  border: '1px solid var(--ds-hairline-strong)', background: 'var(--ds-fill)',
  color: 'var(--ds-label)', fontSize: 16, fontFamily: 'inherit', outline: 'none',
}

function Heading({ kicker, title, children }) {
  return (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-label-3)' }}>{kicker}</span>
      <h1 style={{ fontSize: 'clamp(30px,7vw,40px)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1.08, margin: 0, whiteSpace: 'pre-line' }}>
        {title}
      </h1>
      {children && (
        <p style={{ fontSize: 16, color: 'var(--ds-label-2)', lineHeight: 1.65, margin: '2px auto 0', maxWidth: 400 }}>{children}</p>
      )}
    </div>
  )
}

function Message({ tone = 'error', children }) {
  const color = tone === 'error' ? 'var(--ds-bad)' : 'var(--ds-good)'
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} style={{
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      borderRadius: 12, padding: '11px 15px', fontSize: 13, color: 'var(--ds-label)', lineHeight: 1.5,
      textAlign: 'center', width: '100%', maxWidth: 400,
    }}>
      {children}
    </div>
  )
}

function Links({ children }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 18 }}>{children}</div>
}

function PrimaryButton({ children, ...props }) {
  return (
    <button className="ds-button-primary" style={{ width: '100%', maxWidth: 340, minHeight: 44, fontSize: 15 }} {...props}>
      {children}
    </button>
  )
}

const HISTORY_SAFE = 'Your sessions and history stay on this Mac. Nothing has been deleted.'

export default function BetaAccess({ access, onContinue, hasHistory = false, onViewHistory = null, onOpenPrivacy = null }) {
  const { status } = access
  const [view, setView] = useState('choose')
  const [email, setEmail] = useState(status?.email ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [cooldown, setCooldown] = useState(0)
  const continued = useRef(false)

  const phase = status?.phase ?? 'checking'

  useEffect(() => {
    if (phase === 'active' && !continued.current) {
      continued.current = true
      onContinue?.()
    }
  }, [phase, onContinue])

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const act = async (action, onSuccess) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    const result = await action()
    setBusy(false)
    if (result.error) setError(result.error)
    else onSuccess?.(result.status)
    return result
  }

  const sendCodeTo = address => act(() => access.sendCode(address), () => {
    setEmail(address)
    setCode('')
    setCooldown(RESEND_AFTER_SECONDS)
    setView('code')
  })

  const historyLink = hasHistory && onViewHistory && (
    <button type="button" style={textButton} onClick={onViewHistory}>View my history</button>
  )
  const privacyLink = onOpenPrivacy && (
    <button type="button" style={textButton} onClick={onOpenPrivacy}>Privacy Policy</button>
  )

  let body
  if (phase === 'checking') {
    body = <Heading kicker="Closed beta" title="Checking your access…" />
  } else if (phase === 'active') {
    body = (
      <>
        <Heading kicker="Closed beta" title="You’re in" />
        <PrimaryButton type="button" onClick={onContinue}>Continue</PrimaryButton>
      </>
    )
  } else if (phase === 'waitlist_pending' && view !== 'code') {
    body = (
      <>
        <Heading kicker="Closed beta" title={'You’re on\nthe list'}>
          We’ll email {status.email} when your place is ready. Then come back here and check again.
        </Heading>
        {notice && <Message tone="info">{notice}</Message>}
        {error && <Message>{accessMessage(error)}</Message>}
        <PrimaryButton type="button" disabled={busy} onClick={async () => {
          const result = await sendCodeTo(status.email)
          if (result.error === 'not_invited') {
            setError(null)
            setNotice('Not yet. You’re still on the list, and we’ll email you when your place is ready.')
          }
        }}>
          {busy ? 'Checking…' : 'Check again'}
        </PrimaryButton>
        <Links>
          <button type="button" style={textButton} disabled={busy}
            onClick={() => act(access.forgetPending, () => { setEmail(''); setView('request') })}>
            Change email
          </button>
          {historyLink}
        </Links>
      </>
    )
  } else if (['lapsed', 'no_access', 'network_error', 'needs_check'].includes(phase)) {
    const copy = {
      lapsed: ['Beta access', 'Your beta access\nhas ended', `You can’t start new sessions right now. ${HISTORY_SAFE}`],
      no_access: ['Beta access', 'No beta place\nfor this account', `${status.email ?? 'This account'} is signed in but has no beta place yet. ${HISTORY_SAFE}`],
      network_error: ['Beta access', 'Can’t confirm\nyour access', `Eudaimonai needs to check your beta access with the server. ${HISTORY_SAFE}`],
      needs_check: ['Beta access', 'Can’t confirm\nyour access', status.denial === 'clock_rollback'
        ? `Your Mac’s clock was set back, so your access has to be confirmed online. ${HISTORY_SAFE}`
        : `Your access has to be confirmed online. ${HISTORY_SAFE}`],
    }[phase]
    body = (
      <>
        <Heading kicker={copy[0]} title={copy[1]}>{copy[2]}</Heading>
        {notice && <Message tone="info">{notice}</Message>}
        {error && <Message>{accessMessage(error)}</Message>}
        <PrimaryButton type="button" disabled={busy} onClick={() => act(access.check)}>
          {busy ? 'Checking…' : phase === 'network_error' ? 'Try again' : 'Check again'}
        </PrimaryButton>
        <Links>
          {phase === 'no_access' && status.email && (
            <button type="button" style={textButton} disabled={busy}
              onClick={() => act(() => access.requestAccess(status.email), () => setNotice('Request sent. We’ll email you when your place is ready.'))}>
              Request beta access
            </button>
          )}
          {historyLink}
          <button type="button" style={textButton} disabled={busy} onClick={() => act(access.signOut, () => setView('choose'))}>
            Sign out
          </button>
        </Links>
      </>
    )
  } else if (view === 'request') {
    body = (
      <>
        <Heading kicker="Closed beta" title={'Request\nbeta access'}>
          Enter your email. We invite people in small groups and email you when your place is ready. Requesting doesn’t create an account.
        </Heading>
        <form style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}
          onSubmit={event => { event.preventDefault(); act(() => access.requestAccess(email.trim())) }}>
          <input aria-label="Email address" type="email" autoComplete="email" required placeholder="you@example.com"
            style={fieldStyle} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
          {error && <Message>{accessMessage(error)}</Message>}
          <button className="ds-button-primary" type="submit" style={{ minHeight: 44, fontSize: 15 }} disabled={busy || !email.trim()}>
            {busy ? 'Sending…' : 'Request access'}
          </button>
        </form>
        <Links>
          <button type="button" style={textButton} onClick={() => { setView('choose'); setError(null) }}>Back</button>
          {privacyLink}
        </Links>
      </>
    )
  } else if (view === 'email') {
    body = (
      <>
        <Heading kicker="Closed beta" title="Sign in">
          Enter the email address your invitation was sent to. We’ll email you an 8-digit code. There is no password.
        </Heading>
        <form style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}
          onSubmit={event => { event.preventDefault(); sendCodeTo(email.trim()) }}>
          <input aria-label="Email address" type="email" autoComplete="email" required placeholder="you@example.com"
            style={fieldStyle} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
          {error && <Message>{accessMessage(error)}</Message>}
          <button className="ds-button-primary" type="submit" style={{ minHeight: 44, fontSize: 15 }} disabled={busy || !email.trim()}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </form>
        <Links>
          <button type="button" style={textButton} onClick={() => { setView('choose'); setError(null) }}>Back</button>
          {error === 'not_invited' && (
            <button type="button" style={textButton} onClick={() => { setView('request'); setError(null) }}>Request beta access</button>
          )}
          {privacyLink}
        </Links>
      </>
    )
  } else if (view === 'code') {
    body = (
      <>
        <Heading kicker="Closed beta" title={'Check your\nemail'}>
          We sent an 8-digit code to {email}. It’s valid for 15 minutes.
        </Heading>
        <form style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}
          onSubmit={event => { event.preventDefault(); act(() => access.verifyCode(email, code)) }}>
          <input aria-label="Code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required autoFocus
            style={{ ...fieldStyle, fontFamily: 'var(--mono)', fontSize: 22, letterSpacing: '0.3em', textAlign: 'center' }}
            value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))} disabled={busy} />
          {error && <Message>{accessMessage(error)}</Message>}
          <button className="ds-button-primary" type="submit" style={{ minHeight: 44, fontSize: 15 }} disabled={busy || code.length !== 8}>
            {busy ? 'Checking…' : 'Continue'}
          </button>
        </form>
        <Links>
          <button type="button" style={textButton} disabled={busy || cooldown > 0} onClick={() => sendCodeTo(email)}>
            {cooldown > 0 ? `New code in ${cooldown}s` : 'Send a new code'}
          </button>
          <button type="button" style={textButton} disabled={busy} onClick={() => { setView('email'); setError(null) }}>Use a different email</button>
        </Links>
      </>
    )
  } else {
    body = (
      <>
        <Heading kicker="Closed beta" title={'Eudaimonai is in\na closed beta'}>
          Request a place, or sign in if you’ve been invited. Signing in only checks your beta access: your sessions stay on this Mac.
        </Heading>
        <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <PrimaryButton type="button" onClick={() => { setView('request'); setError(null) }}>Request beta access</PrimaryButton>
          <button type="button" className="ds-button-secondary" style={{ minHeight: 44, fontSize: 15 }}
            onClick={() => { setView('email'); setError(null) }}>
            I already have access
          </button>
        </div>
        <Links>
          {historyLink}
          {privacyLink}
        </Links>
      </>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: 440, margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 }}>
      {body}
    </div>
  )
}
