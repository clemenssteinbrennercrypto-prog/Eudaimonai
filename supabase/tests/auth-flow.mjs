// End-to-end check of the beta access flow through the real local Supabase
// stack: Auth (email codes + the invite-only hook), PostgREST (RLS and the
// public functions) and Mailpit (the local mail catcher that receives codes).
//
// LOCAL ONLY. Run with: node supabase/tests/auth-flow.mjs
// It resets the local database first.
import { execFileSync } from 'node:child_process'

const root = new URL('../..', import.meta.url).pathname
const env = Object.fromEntries(
  execFileSync('supabase', ['status', '-o', 'env'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map(line => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value]),
)
const API = env.API_URL
const MAIL = env.MAILPIT_URL || env.INBUCKET_URL
const PUBLISHABLE = env.PUBLISHABLE_KEY
const SECRET = env.SECRET_KEY || env.SERVICE_ROLE_KEY
const DB_URL = env.DB_URL
if (!/^http:\/\/127\.0\.0\.1:/.test(API) || !DB_URL.includes('@127.0.0.1:')) {
  console.error(`Refusing to run against a non-local stack: ${API}`)
  process.exit(2)
}

const psql = process.env.PSQL || '/opt/homebrew/opt/libpq/bin/psql'
const sql = query => execFileSync(psql, [DB_URL, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8' }).trim()

let failures = 0
const check = (description, condition, detail = '') => {
  console.log(`${condition ? 'ok' : 'not ok'} - ${description}${condition || !detail ? '' : ` (${detail})`}`)
  if (!condition) failures += 1
}

async function call(path, { method = 'GET', token, body, apikey = PUBLISHABLE, headers = {} } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      apikey,
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* not json */ }
  return { status: response.status, json, text }
}

const rpc = (name, args = {}, token) => call(`/rest/v1/rpc/${name}`, { method: 'POST', token, body: args })
const requestCode = email => call('/auth/v1/otp', { method: 'POST', body: { email, create_user: true } })

async function latestCode(email) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const search = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then(r => r.json())
    const id = search.messages?.[0]?.ID
    if (id) {
      const message = await fetch(`${MAIL}/api/v1/message/${id}`).then(r => r.json())
      // Exactly 8 digits, matching staging; a 6-digit code means config drift.
      const code = `${message.Text} ${message.HTML}`.match(/\b(\d{8})\b/)?.[1]
      if (code) return code
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`no code arrived for ${email}`)
}

async function latestMessage(email, matches = () => true) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const search = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then(r => r.json())
    for (const summary of search.messages ?? []) {
      const message = await fetch(`${MAIL}/api/v1/message/${summary.ID}`).then(r => r.json())
      if (matches(message)) return message
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return null
}

// Email-change confirmations arrive as links; following one confirms that address.
async function confirmEmailChange(email) {
  const message = await latestMessage(email, m => /type=email_change/.test(`${m.Text} ${m.HTML}`))
  const link = `${message?.Text} ${message?.HTML}`.match(/https?:\/\/[^\s"'<>)]+type=email_change[^\s"'<>)]*/)?.[0]
  if (!link) throw new Error(`no email-change link for ${email}`)
  const response = await fetch(link.replaceAll('&amp;', '&'), { redirect: 'manual' })
  return response.status
}

async function signIn(email) {
  const sent = await requestCode(email)
  if (sent.status !== 200) throw new Error(`code request for ${email} failed: ${sent.status} ${sent.text}`)
  const verified = await call('/auth/v1/verify', { method: 'POST', body: { type: 'email', email, token: await latestCode(email) } })
  if (verified.status !== 200) throw new Error(`verify for ${email} failed: ${verified.status} ${verified.text}`)
  return verified.json
}

execFileSync('supabase', ['db', 'reset'], { cwd: root, stdio: 'ignore' })
await fetch(`${MAIL}/api/v1/messages`, { method: 'DELETE' })

// ── 1. Founder bootstrap, exactly as the setup doc describes ──────────────
sql(`insert into public.signup_allowlist (email_normalized, note) values ('founder@example.com', 'founder')`)
const founder = await signIn('founder@example.com')
check('allowlisted founder can create an account with an email code', Boolean(founder?.access_token))
sql(`insert into public.admin_users (user_id, note) select id, 'founder' from auth.users where email = 'founder@example.com'`)
const internal = await rpc('admin_grant_internal', { p_user_id: founder.user.id }, founder.access_token)
check('founder grants themselves internal access through the API', internal.status === 200, internal.text)
const founderAccess = await rpc('get_my_access', {}, founder.access_token)
check('founder state is INTERNAL with open-ended access',
  founderAccess.json?.state === 'INTERNAL' && founderAccess.json?.access_until === null, founderAccess.text)

// ── 2. Uninvited people cannot get an account ─────────────────────────────
const stranger = await requestCode('stranger@example.com')
check('an uninvited email cannot start sign-up', stranger.status >= 400, `${stranger.status} ${stranger.text}`)
check('the refusal says the beta is invite-only', /invite-only/i.test(stranger.text), stranger.text)
check('no account was created for the stranger', sql(`select count(*) from auth.users where email = 'stranger@example.com'`) === '0')

const joined = await rpc('join_waitlist', { p_email: 'Friend@Example.com', p_source: 'landing' })
check('anon joins the waitlist via the public API', joined.status === 204 || joined.status === 200, `${joined.status} ${joined.text}`)
const joinedAgain = await rpc('join_waitlist', { p_email: 'friend@example.com' })
check('duplicate waitlist signup returns the same success', joinedAgain.status === joined.status, `${joinedAgain.status}`)
const waitlisted = await requestCode('friend@example.com')
check('waitlist alone does not allow an account', waitlisted.status >= 400, `${waitlisted.status}`)

// ── 3. Anonymous API access sees nothing ─────────────────────────────────
for (const table of ['waitlist_entries', 'beta_invitations', 'beta_allocations', 'entitlements', 'admin_users', 'admin_audit_log', 'signup_allowlist', 'beta_program_config']) {
  const read = await call(`/rest/v1/${table}?select=*`)
  check(`anon cannot read ${table}`, read.status >= 400 || (Array.isArray(read.json) && read.json.length === 0), `${read.status} ${read.text}`)
}
const anonInvite = await rpc('admin_invite', { p_email: 'x@example.com' })
check('anon cannot call admin_invite', anonInvite.status >= 400, `${anonInvite.status}`)

// ── 4. Invite → code → claim ─────────────────────────────────────────────
const invite = await rpc('admin_invite', { p_email: 'friend@example.com' }, founder.access_token)
check('admin invites the waitlisted friend', invite.status === 200, invite.text)
const friend = await signIn('friend@example.com')
check('invited friend creates an account with an email code', Boolean(friend?.access_token))
let access = await rpc('get_my_access', {}, friend.access_token)
check('before claiming: INVITED, no access', access.json?.state === 'INVITED' && access.json?.has_access === false, access.text)
const claim = await rpc('claim_beta_invitation', {}, friend.access_token)
check('friend claims the beta', claim.status === 200, claim.text)
access = await rpc('get_my_access', {}, friend.access_token)
check('after claiming: BETA, access granted', access.json?.state === 'BETA' && access.json?.has_access === true, access.text)
const replay = await rpc('claim_beta_invitation', {}, friend.access_token)
check('claim replay is refused', replay.status >= 400 && /already_activated/.test(replay.text), replay.text)

// ── 5. The entitled user cannot change their own access ───────────────────
const own = await call('/rest/v1/entitlements?select=id,user_id,kind,ends_at', { token: friend.access_token })
check('friend reads exactly their own entitlement', own.json?.length === 1 && own.json[0].user_id === friend.user.id, own.text)
const entitlementId = own.json?.[0]?.id
const patch = await call(`/rest/v1/entitlements?id=eq.${entitlementId}`, {
  method: 'PATCH', token: friend.access_token, body: { ends_at: '2099-01-01T00:00:00Z' }, headers: { prefer: 'return=representation' },
})
check('PATCH on own entitlement is refused', patch.status >= 400, `${patch.status} ${patch.text}`)
const insert = await call('/rest/v1/entitlements', {
  method: 'POST', token: friend.access_token, body: { user_id: friend.user.id, kind: 'internal', source: 'admin', source_ref: 'self' },
})
check('POST of a self-granted entitlement is refused', insert.status >= 400, `${insert.status} ${insert.text}`)
const del = await call(`/rest/v1/entitlements?id=eq.${entitlementId}`, { method: 'DELETE', token: friend.access_token })
check('DELETE of own entitlement is refused', del.status >= 400, `${del.status} ${del.text}`)
const makeAdmin = await call('/rest/v1/admin_users', { method: 'POST', token: friend.access_token, body: { user_id: friend.user.id } })
check('a user cannot insert themselves into admin_users', makeAdmin.status >= 400, `${makeAdmin.status}`)
const userInvite = await rpc('admin_invite', { p_email: 'plusone@example.com' }, friend.access_token)
check('a beta user cannot invite others', userInvite.status >= 400 && /not_authorized/.test(userInvite.text), userInvite.text)
const userWaitlist = await call('/rest/v1/waitlist_entries?select=*', { token: friend.access_token })
check('a beta user reads no waitlist rows', Array.isArray(userWaitlist.json) && userWaitlist.json.length === 0, userWaitlist.text)
check('entitlement unchanged after the attempts',
  sql(`select ends_at > now() + interval '29 days' and ends_at < now() + interval '31 days' from public.entitlements where id = '${entitlementId}'`) === 't')

// ── 6. Session restoration via refresh token ─────────────────────────────
const refreshed = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: friend.refresh_token } })
check('refresh token yields a new session', refreshed.status === 200 && Boolean(refreshed.json?.access_token), refreshed.text)
access = await rpc('get_my_access', {}, refreshed.json?.access_token)
check('restored session still has BETA access', access.json?.has_access === true, access.text)

// ── 7. Revocation reaches the user immediately ───────────────────────────
const revoke = await rpc('admin_revoke_entitlement', { p_entitlement_id: entitlementId, p_reason: 'e2e' }, founder.access_token)
check('admin revokes the entitlement', revoke.status === 200, revoke.text)
access = await rpc('get_my_access', {}, refreshed.json?.access_token)
check('after revocation: no access, LAPSED', access.json?.has_access === false && access.json?.state === 'LAPSED', access.text)
const reinvite = await rpc('admin_invite', { p_email: 'friend@example.com' }, founder.access_token)
check('revoked beta user cannot be given a second free allocation', /already_activated/.test(reinvite.text), reinvite.text)

// ── 8. Admin-API user creation (dashboard "Add user") ────────────────────
// Records whether the invite-only hook also guards accounts created with the
// secret key; the setup doc depends on the answer.
const adminCreate = await call('/auth/v1/admin/users', {
  method: 'POST', apikey: SECRET, token: SECRET.startsWith('ey') ? SECRET : undefined,
  body: { email: 'dashboard-made@example.com', email_confirm: true },
})
console.log(`# admin-API create of an uninvited email -> HTTP ${adminCreate.status}: ${adminCreate.text.slice(0, 160)}`)

// ── 9. Invitation email (Edge Function send-invitation) ──────────────────
const fn = (body, token, apikey = PUBLISHABLE) => fetch(`${API}/functions/v1/send-invitation`, {
  method: 'POST',
  headers: { apikey, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
}).then(async r => ({ status: r.status, json: await r.json().catch(() => null) }))

const invitee = await rpc('admin_invite', { p_email: 'invitee@example.com' }, founder.access_token)
check('admin creates an invitation for the email test', invitee.status === 200, invitee.text)
const inviteId = invitee.json?.id
const sentInvite = await fn({ invitation_id: inviteId }, founder.access_token)
check('admin sends the invitation email', sentInvite.status === 200 && sentInvite.json?.sent === true, JSON.stringify(sentInvite))
const inviteMail = await latestMessage('invitee@example.com', m => m.Subject === 'Your invitation to the Eudaimonai beta')
check('the invitation email arrives with its subject', Boolean(inviteMail))
check('it carries exactly one action: the activation link for that address',
  (inviteMail?.Text ?? '').includes('/activate?email=invitee%40example.com'), inviteMail?.Text?.slice(0, 200))
check('it contains no sign-in code (codes come only from Supabase Auth)', !/\b\d{8}\b/.test(inviteMail?.Text ?? ''))
const nonAdminSend = await fn({ invitation_id: inviteId }, refreshed.json?.access_token)
check('a signed-in non-admin cannot send invitation emails', nonAdminSend.status === 404, JSON.stringify(nonAdminSend))
const anonSend = await fn({ invitation_id: inviteId })
check('an anonymous caller cannot send invitation emails', anonSend.status === 401, JSON.stringify(anonSend))
const forgedSend = await fn({ invitation_id: inviteId }, 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4Iiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.forged')
check('a forged token cannot send invitation emails', forgedSend.status === 401, JSON.stringify(forgedSend))
const badIdSend = await fn({ invitation_id: 'not-a-uuid' }, founder.access_token)
check('a malformed invitation id is rejected', badIdSend.status === 400, JSON.stringify(badIdSend))
await rpc('admin_revoke_invitation', { p_invitation_id: inviteId }, founder.access_token)
const revokedSend = await fn({ invitation_id: inviteId }, founder.access_token)
check('a revoked invitation is not emailed', revokedSend.status === 409, JSON.stringify(revokedSend))

// ── 10. Changing the account email (audit edge case) ─────────────────────
// A pending change must not let anyone claim the target address's invitation;
// a completed change (both addresses confirmed) proves ownership of the new
// address; and an already-activated account never gets a second slot.
await rpc('admin_invite', { p_email: 'target@example.com' }, founder.access_token)
const change = await call('/auth/v1/user', { method: 'PUT', token: founder.access_token, body: { email: 'target@example.com' } })
check('an account can request an email change', change.status === 200, change.text)
check('while pending, the account email is unchanged',
  sql(`select email from auth.users where id = '${founder.user.id}'`) === 'founder@example.com')
const pendingClaim = await rpc('claim_beta_invitation', {}, founder.access_token)
check('a pending email change cannot claim the new address\'s invitation',
  /no_valid_invitation/.test(pendingClaim.text), pendingClaim.text)
const oldConfirm = await confirmEmailChange('founder@example.com')
check('confirming only the old address does not complete the change',
  sql(`select email from auth.users where id = '${founder.user.id}'`) === 'founder@example.com', `status ${oldConfirm}`)
const newConfirm = await confirmEmailChange('target@example.com')
check('confirming the new address too completes the change',
  sql(`select email from auth.users where id = '${founder.user.id}'`) === 'target@example.com', `status ${newConfirm}`)
const changedClaim = await rpc('claim_beta_invitation', {}, founder.access_token)
check('after a completed change, the account may claim the new address\'s invitation (ownership proven)',
  changedClaim.status === 200, changedClaim.text)
const secondClaim = await rpc('claim_beta_invitation', {}, founder.access_token)
check('and only once', /already_activated/.test(secondClaim.text), secondClaim.text)

// An already-activated account moving to another invited address gains nothing.
await rpc('admin_invite', { p_email: 'target2@example.com' }, founder.access_token)
const friendToken = refreshed.json?.access_token
await call('/auth/v1/user', { method: 'PUT', token: friendToken, body: { email: 'target2@example.com' } })
await confirmEmailChange('friend@example.com')
await confirmEmailChange('target2@example.com')
check('setup: the activated friend now uses target2@example.com',
  sql(`select email from auth.users where id = '${friend.user.id}'`) === 'target2@example.com')
const movedClaim = await rpc('claim_beta_invitation', {}, friendToken)
check('an activated account cannot take a second slot by changing its email', /already_activated/.test(movedClaim.text), movedClaim.text)
check('the friend still holds exactly one allocation',
  sql(`select count(*) from public.beta_allocations where user_id = '${friend.user.id}'`) === '1')
const oldAddressInvite = await rpc('admin_invite', { p_email: 'friend@example.com' }, founder.access_token)
check('the old address stays blocked from a second free slot', /already_activated/.test(oldAddressInvite.text), oldAddressInvite.text)

// ── 11. Waitlist rate limit over HTTP ────────────────────────────────────
const fromIp = (email, ip) => call('/rest/v1/rpc/join_waitlist', {
  method: 'POST', body: { p_email: email }, headers: { 'x-forwarded-for': ip },
})
let accepted = 0
for (let n = 1; n <= 10; n += 1) if ((await fromIp(`burst${n}@example.com`, '203.0.113.50')).status < 300) accepted += 1
check('10 waitlist requests from one IP within an hour are accepted', accepted === 10, `${accepted}`)
const eleventh = await fromIp('burst11@example.com', '203.0.113.50')
check('the 11th is refused with rate_limited', eleventh.status >= 400 && /rate_limited/.test(eleventh.text), `${eleventh.status} ${eleventh.text}`)
const otherIp = await fromIp('other@example.com', '198.51.100.20')
check('a different IP is unaffected', otherIp.status < 300, `${otherIp.status}`)

execFileSync('supabase', ['db', 'reset'], { cwd: root, stdio: 'ignore' })
console.log(failures ? `FAIL (${failures})` : 'PASS')
process.exit(failures ? 1 : 0)
