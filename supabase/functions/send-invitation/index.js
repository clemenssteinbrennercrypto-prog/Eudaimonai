// Sends the "you're invited" email for an invitation that already exists.
//
// Creating the invitation (and the capacity decision) happens in the database
// function admin_invite. This function only delivers mail, so it holds no
// privileged database key at all: it reads the invitation with the CALLER's
// token. PostgREST verifies that token and RLS lets only admins read
// beta_invitations, so a non-admin, an anonymous caller or a forged token
// gets nothing to send. The only secret here is the mail provider key.
//
// Environment:
//   SUPABASE_URL, SUPABASE_ANON_KEY   provided by Supabase
//   SITE_URL                          public website origin, e.g. https://eudaimonai.app
//   MAIL_FROM                         "Eudaimonai <noreply@mail.eudaimonai.app>"
//   MAIL_TRANSPORT                    "resend" (default) or "mailpit" (local only)
//   RESEND_API_KEY                    required for "resend"
//   MAILPIT_SEND_URL                  required for "mailpit"
//   ALLOWED_ORIGINS                   optional, comma-separated extra CORS origins

const env = name => Deno.env.get(name) ?? ''
const SUPABASE_URL = env('SUPABASE_URL')
const ANON_KEY = env('SUPABASE_ANON_KEY')
const SITE_URL = env('SITE_URL').replace(/\/+$/, '')
const MAIL_FROM = env('MAIL_FROM')
const TRANSPORT = env('MAIL_TRANSPORT') || 'resend'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const allowedOrigins = new Set([SITE_URL, ...env('ALLOWED_ORIGINS').split(',').map(o => o.trim())].filter(Boolean))

function cors(req) {
  const origin = req.headers.get('origin') ?? ''
  return {
    'access-control-allow-origin': allowedOrigins.has(origin) ? origin : SITE_URL,
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'origin',
  }
}

const reply = (status, body, headers) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } })

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function invitationEmail({ email, expiresAt, siteUrl }) {
  const link = `${siteUrl}/activate?email=${encodeURIComponent(email)}`
  const until = new Date(expiresAt).toLocaleString('en-GB', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna', timeZoneName: 'short',
  })
  const subject = 'Your invitation to the Eudaimonai beta'
  const text = [
    'You are invited to the closed beta of Eudaimonai, a Mac app for focus sessions.',
    '',
    `Activate your access before ${until}:`,
    link,
    '',
    'You will confirm this email address with a one-time code. There is no password.',
    'After activating, you can download the app for Apple Silicon Macs.',
    '',
    'Your focus sessions and history stay on your Mac. We only keep your email address and your beta access.',
    '',
    'If you did not expect this invitation, you can ignore this email.',
  ].join('\n')
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
  <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin:0 0 12px">Eudaimonai · Closed beta</p>
  <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px">You're invited to the Eudaimonai beta</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 24px">Eudaimonai is a Mac app for focus sessions. Activate your access before <strong>${escapeHtml(until)}</strong>.</p>
  <p style="margin:0 0 28px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#2C46FF;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px">Activate beta access</a></p>
  <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0 0 12px">You'll confirm this email address with a one-time code. There is no password. After activating, you can download the app for Apple Silicon Macs.</p>
  <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0 0 12px">Your focus sessions and history stay on your Mac. We only keep your email address and your beta access.</p>
  <p style="font-size:12px;line-height:1.6;color:#9ca3af;margin:24px 0 0">If you did not expect this invitation, you can ignore this email.</p>
</div></body></html>`
  return { subject, text, html, link }
}

async function deliver({ to, subject, text, html }) {
  if (TRANSPORT === 'mailpit') {
    const response = await fetch(env('MAILPIT_SEND_URL'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        From: { Email: MAIL_FROM.match(/<([^>]+)>/)?.[1] ?? MAIL_FROM, Name: MAIL_FROM.replace(/\s*<[^>]+>/, '') },
        To: [{ Email: to }],
        Subject: subject,
        Text: text,
        HTML: html,
      }),
    })
    if (!response.ok) throw new Error(`mailpit ${response.status}`)
    return
  }
  const key = env('RESEND_API_KEY')
  if (!key) throw new Error('mail provider is not configured')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, text, html }),
  })
  if (!response.ok) throw new Error(`resend ${response.status}`)
}

Deno.serve(async req => {
  const headers = cors(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' }, headers)
  if (!SITE_URL || !MAIL_FROM) return reply(500, { error: 'not_configured' }, headers)

  const authorization = req.headers.get('authorization') ?? ''
  if (!/^Bearer\s+\S+/.test(authorization)) return reply(401, { error: 'not_authenticated' }, headers)

  const body = await req.json().catch(() => ({}))
  const id = String(body?.invitation_id ?? '')
  if (!UUID.test(id)) return reply(400, { error: 'invalid_invitation_id' }, headers)

  // Read as the caller. RLS returns the row only to admins.
  const lookup = await fetch(
    `${SUPABASE_URL}/rest/v1/beta_invitations?id=eq.${id}&select=id,email_normalized,expires_at,accepted_at,revoked_at`,
    { headers: { apikey: ANON_KEY, authorization } },
  )
  if (lookup.status === 401 || lookup.status === 403) return reply(401, { error: 'not_authenticated' }, headers)
  if (!lookup.ok) return reply(502, { error: 'lookup_failed' }, headers)
  const [invitation] = await lookup.json()
  if (!invitation) return reply(404, { error: 'invitation_not_found' }, headers)

  const live = !invitation.accepted_at && !invitation.revoked_at && new Date(invitation.expires_at) > new Date()
  if (!live) return reply(409, { error: 'invitation_not_live' }, headers)

  const message = invitationEmail({ email: invitation.email_normalized, expiresAt: invitation.expires_at, siteUrl: SITE_URL })
  try {
    await deliver({ to: invitation.email_normalized, ...message })
  } catch (error) {
    console.error('invitation email failed', error.message)
    return reply(502, { error: 'email_failed' }, headers)
  }
  return reply(200, { sent: true, expires_at: invitation.expires_at }, headers)
})
