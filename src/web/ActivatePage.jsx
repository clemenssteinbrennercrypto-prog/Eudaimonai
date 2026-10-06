import { useEffect, useRef, useState } from 'react'
import WebShell from './WebShell'
import { formatDate } from './format'
import { CONTACT_EMAIL } from './contact'

const RESEND_AFTER_SECONDS = 60

const REQUEST_ERRORS = {
  not_invited: 'There’s no open invitation for this address. Invitations are valid for 72 hours. If yours has expired, request access again and we’ll send a new one.',
  rate_limited: 'Please wait a minute before requesting another code.',
  invalid_email: 'That doesn’t look like a complete email address.',
  network: 'We couldn’t reach the server. Check your connection and try again.',
  unknown: 'Something went wrong on our side. Please try again in a moment.',
}

const VERIFY_ERRORS = {
  code_invalid: 'That code is wrong or has expired. Check the latest email, or send a new code.',
  rate_limited: 'Too many attempts. Please wait a minute and try again.',
  network: REQUEST_ERRORS.network,
  unknown: REQUEST_ERRORS.unknown,
}

function initialEmail(search) {
  return new URLSearchParams(search).get('email')?.trim() ?? ''
}

// Invitation → email code → claim. The account is created by the code step
// only because the database hook finds a live invitation for the address.
// When the claim finishes (or fails) the website session is ended again: the
// beta is used in the Mac app, so nothing needs to stay signed in here.
export default function ActivatePage({ api, search = window.location.search }) {
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState(() => initialEmail(search))
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef(null)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus()
  }, [step])

  if (!api?.configured) {
    return (
      <WebShell>
        <h1 className="web-title">Activation isn’t open yet</h1>
        <p className="web-lead">Beta activation is not available right now. Please try again later.</p>
      </WebShell>
    )
  }

  const sendCode = async event => {
    event?.preventDefault()
    setError(null)
    setBusy(true)
    const { error: requestError } = await api.requestCode(email.trim(), { createUser: true })
    setBusy(false)
    if (requestError) {
      setError(REQUEST_ERRORS[requestError] ? requestError : 'unknown')
      return
    }
    setCode('')
    setCooldown(RESEND_AFTER_SECONDS)
    setStep('code')
  }

  const finish = async outcome => {
    await api.signOut()
    setResult(outcome)
    setStep('done')
  }

  const verify = async event => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    const { error: verifyError } = await api.verifyCode(email.trim(), code.trim())
    if (verifyError) {
      setBusy(false)
      setError(VERIFY_ERRORS[verifyError] ? verifyError : 'unknown')
      return
    }

    const claim = await api.claimInvitation()
    if (!claim.error) {
      setBusy(false)
      await finish({ kind: 'activated', until: claim.data?.ends_at })
      return
    }

    // Already holding access (an earlier activation, or internal access) is
    // a success from the visitor's point of view.
    const access = await api.myAccess()
    setBusy(false)
    if (access.data?.has_access) {
      await finish({ kind: 'already_active', until: access.data.access_until })
      return
    }
    await finish({ kind: claim.error === 'already_activated' ? 'used' : 'no_invitation' })
  }

  return (
    <WebShell note="Closed beta">
      {step === 'email' && (
        <>
          <span className="web-kicker">Closed beta</span>
          <h1 className="web-title">Activate your beta access</h1>
          <p className="web-lead">
            Enter the email address your invitation was sent to. We’ll email you an 8-digit code. There is no password.
          </p>
          <form className="web-card" onSubmit={sendCode}>
            <label className="web-field">
              Email address
              <input
                className="web-input"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                disabled={busy}
              />
            </label>
            <button className="web-button" type="submit" disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
            {error && <p className="web-message is-error" role="alert">{REQUEST_ERRORS[error]}</p>}
          </form>
        </>
      )}

      {step === 'code' && (
        <>
          <span className="web-kicker">Closed beta</span>
          <h1 className="web-title">Check your email</h1>
          <p className="web-lead">
            We sent an 8-digit code to <strong>{email.trim()}</strong>. It’s valid for 15 minutes.
          </p>
          <form className="web-card" onSubmit={verify}>
            <label className="web-field">
              Code
              <input
                ref={codeRef}
                className="web-input is-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{8}"
                maxLength={8}
                required
                value={code}
                onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
                disabled={busy}
              />
            </label>
            <div className="web-actions">
              <button className="web-button" type="submit" disabled={busy || code.length !== 8}>
                {busy ? 'Activating…' : 'Activate'}
              </button>
              <button className="web-button is-secondary" type="button" onClick={sendCode} disabled={busy || cooldown > 0}>
                {cooldown > 0 ? `New code in ${cooldown}s` : 'Send a new code'}
              </button>
            </div>
            {error && (
              <p className="web-message is-error" role="alert">{VERIFY_ERRORS[error] ?? REQUEST_ERRORS[error]}</p>
            )}
            <p className="web-note">
              Wrong address?{' '}
              <button type="button" className="web-link-button" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 13, textDecoration: 'underline' }} onClick={() => { setStep('email'); setError(null) }}>
                Use a different email
              </button>
            </p>
          </form>
        </>
      )}

      {step === 'done' && <Outcome result={result} />}
    </WebShell>
  )
}

function Outcome({ result }) {
  if (result?.kind === 'activated' || result?.kind === 'already_active') {
    return (
      <>
        <span className="web-kicker">{result.kind === 'activated' ? 'Activated' : 'Already active'}</span>
        <h1 className="web-title">{result.kind === 'activated' ? 'You’re in.' : 'Your access is already active.'}</h1>
        <p className="web-lead">
          {result.until
            ? <>Your beta access runs until <strong>{formatDate(result.until)}</strong>.</>
            : <>Your access has no end date.</>}
          {' '}Next, download Eudaimonai for your Mac.
        </p>
        <a className="web-button" href="/download">Download Eudaimonai</a>
        <p className="web-note">For your privacy, this website doesn’t keep you signed in.</p>
      </>
    )
  }
  if (result?.kind === 'used') {
    return (
      <>
        <h1 className="web-title">This beta place has been used</h1>
        <p className="web-lead">
          This address already activated its free beta place, and that access has ended. Each address can
          activate the free beta once. If you think this is a mistake, write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'inherit' }}>{CONTACT_EMAIL}</a>.
        </p>
      </>
    )
  }
  return (
    <>
      <h1 className="web-title">This invitation is no longer open</h1>
      <p className="web-lead">
        It may have expired after 72 hours or been withdrawn. If you’d still like to join, request access again
        and we’ll get back to you.
      </p>
      <a className="web-button is-secondary" href="/">Request access</a>
    </>
  )
}
