// The app's side of beta access. Rust owns the identity (sign-in, tokens in
// the Keychain, the access decision and the gates on session and camera
// start); this module only asks it for a status and passes user input along.
// No token, code or Supabase text is ever stored or shown here.
import { useCallback, useEffect, useState } from 'react'
import { getNativeApi } from './nativeCompanion'

const ACCESS_EVENT = 'access-state-changed'

export const isNativeApp = () => Boolean(getNativeApi()?.core?.invoke)

// What each Rust error code means to the person in front of the app.
export const ACCESS_MESSAGES = {
  invalid_email: 'That doesn’t look like a complete email address.',
  code_invalid: 'That code is wrong or has expired. Check the latest email, or send a new code.',
  not_invited: 'There’s no invitation for this address yet. Request access and we’ll email you when your place is ready.',
  no_account: 'There’s no account for this address yet.',
  rate_limited: 'Too many attempts. Please wait a minute and try again.',
  network: 'Eudaimonai can’t reach the server. Check your connection and try again.',
  server_error: 'The server is having trouble right now. Please try again in a moment.',
  session_expired: 'You were signed out. Please sign in again.',
  already_activated: 'This address has already used its free beta place.',
  unknown: 'Something went wrong. Please try again.',
}

export const accessMessage = code => ACCESS_MESSAGES[code] ?? ACCESS_MESSAGES.unknown

function errorCodeOf(error) {
  const code = typeof error === 'string' ? error : error?.message
  return code && /^[a-z_]+$/.test(code) ? code : 'unknown'
}

async function call(command, args) {
  const invoke = getNativeApi()?.core?.invoke
  if (!invoke) return { status: null, error: 'unknown' }
  try {
    const status = await (args === undefined ? invoke(command) : invoke(command, args))
    return { status, error: null }
  } catch (error) {
    return { status: null, error: errorCodeOf(error) }
  }
}

export const fetchAccessStatus = () => call('access_status')
export const checkAccess = () => call('access_check')
export const requestBetaAccess = email => call('access_request_waitlist', { email })
export const sendSignInCode = email => call('access_send_code', { email })
export const verifySignInCode = (email, code) => call('access_verify_code', { email, code })
export const signOutOfBeta = () => call('access_sign_out')
export const forgetPendingRequest = () => call('access_forget_pending')

async function listenAccess(onStatus) {
  const listen = getNativeApi()?.event?.listen
  if (!listen) return () => {}
  try {
    return await listen(ACCESS_EVENT, event => onStatus(event?.payload))
  } catch {
    return () => {}
  }
}

// Outside the native app (browser dev view) there is no Rust gate and no
// camera, so nothing is gated there.
const NOT_NATIVE = Object.freeze({ phase: 'active', mayStartSessions: true, native: false })

/**
 * The access status, kept current from Rust's `access-state-changed` events.
 * `status` is null until the first answer arrives.
 */
export function useBetaAccess() {
  const native = isNativeApp()
  const [status, setStatus] = useState(native ? null : NOT_NATIVE)

  useEffect(() => {
    if (!native) return undefined
    let cancelled = false
    let unlisten = () => {}
    fetchAccessStatus().then(result => { if (!cancelled && result.status) setStatus(result.status) })
    listenAccess(next => { if (!cancelled && next) setStatus(next) }).then(off => {
      if (cancelled) off?.()
      else unlisten = off
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [native])

  // Every action returns { status, error } and adopts a new status at once,
  // without waiting for the event.
  const run = useCallback(async action => {
    const result = await action()
    if (result.status) setStatus(result.status)
    return result
  }, [])

  return {
    native,
    status,
    requestAccess: email => run(() => requestBetaAccess(email)),
    sendCode: email => run(() => sendSignInCode(email)),
    verifyCode: (email, code) => run(() => verifySignInCode(email, code)),
    check: () => run(checkAccess),
    signOut: () => run(signOutOfBeta),
    forgetPending: () => run(forgetPendingRequest),
  }
}
