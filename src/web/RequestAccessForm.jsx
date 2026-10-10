import { useState } from 'react'
import { attributionFromSearch } from './attribution'

const MESSAGES = {
  invalid_email: 'That doesn’t look like a complete email address.',
  rate_limited: 'Too many requests from your network right now. Please try again in an hour.',
  network: 'We couldn’t reach the server. Check your connection and try again.',
  unknown: 'Something went wrong on our side. Please try again in a moment.',
}

// Waitlist signup. Joining never creates an account and never grants access;
// the confirmation says so. A duplicate address gets the same confirmation,
// so the form never reveals who is already on the list.
export default function RequestAccessForm({ api, onOpenPrivacy, search = window.location.search }) {
  const [email, setEmail] = useState('')
  const [trap, setTrap] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  if (!api?.configured) {
    return (
      <div className="request-form">
        <p className="web-message is-info">Beta requests open soon.</p>
      </div>
    )
  }

  const submit = async event => {
    event.preventDefault()
    setError(null)
    // Bots fill every field; people never see this one.
    if (trap) {
      setStatus('done')
      return
    }
    setStatus('submitting')
    const { error: code } = await api.joinWaitlist(email.trim(), attributionFromSearch(search))
    if (code) {
      setError(code === 'invalid_email' || code === 'rate_limited' || code === 'network' ? code : 'unknown')
      setStatus('idle')
      return
    }
    setStatus('done')
  }

  if (status === 'done') {
    return (
      <div className="request-form" aria-live="polite">
        <p className="web-message is-success">
          <strong>You’re on the list.</strong> Eudaimonai is in a closed beta. We invite people in small
          groups and will email you when your place is ready. Joining doesn’t create an account.
        </p>
      </div>
    )
  }

  return (
    <form className="request-form" onSubmit={submit} noValidate={false}>
      <div className="request-form-row">
        <label htmlFor="request-email" className="request-form-trap">Email address</label>
        <input
          id="request-email"
          className="web-input"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@example.com"
          aria-label="Email address"
          value={email}
          onChange={event => setEmail(event.target.value)}
          disabled={status === 'submitting'}
        />
        <button className="web-button" type="submit" disabled={status === 'submitting' || !email.trim()}>
          {status === 'submitting' ? 'Sending…' : 'Request beta access'}
        </button>
      </div>
      <div className="request-form-trap" aria-hidden="true">
        <label>
          Company
          <input tabIndex={-1} autoComplete="off" name="company" value={trap} onChange={event => setTrap(event.target.value)} />
        </label>
      </div>
      {error && <p className="web-message is-error" role="alert">{MESSAGES[error]}</p>}
      <p className="web-note">
        We only store your email address for the beta. Your focus data never leaves your Mac.{' '}
        {onOpenPrivacy && (
          <button type="button" className="web-link-button" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 13, textDecoration: 'underline' }} onClick={onOpenPrivacy}>
            Privacy policy
          </button>
        )}
      </p>
    </form>
  )
}
