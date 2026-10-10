// What the app shows for a given beta-access status. Pure, so the rules are
// tested without rendering the whole app.

// Read-only history: these destinations need access and are locked.
export const LOCKED_WHEN_READ_ONLY = ['lab', 'session-setup', 'setup', 'focus-apps']

/**
 * 'app'       normal app
 * 'access'    the access step (sign in / request / ended / offline too long)
 * 'read_only' history and export only, chosen from the access step
 *
 * A running session is never interrupted, whatever the status says.
 */
export function accessView({ native, status, screen, viewingHistory }) {
  if (!native || screen === 'session') return 'app'
  if (status?.mayStartSessions === true) return 'app'
  return viewingHistory ? 'read_only' : 'access'
}

export function mayNavigate(view, destination) {
  return view !== 'read_only' || !LOCKED_WHEN_READ_ONLY.includes(destination)
}

/**
 * Asked right before a session starts. A verification older than a few
 * minutes is refreshed first, so a revocation applies at the next start;
 * offline, Rust's grace decision answers. Rust still refuses the session and
 * camera start on its own if this says yes wrongly.
 */
export async function confirmSessionAccess(access) {
  if (!access.native) return true
  let current = access.status
  if (current?.source !== 'verified') current = (await access.check()).status ?? current
  return current?.mayStartSessions === true
}
