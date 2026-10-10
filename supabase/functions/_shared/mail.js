// Mail delivery shared by the Edge Functions. Resend in hosted projects,
// Mailpit in the local stack.
//
// Environment:
//   MAIL_FROM          "Eudaimonai <noreply@mail.eudaimonai.app>"
//   MAIL_TRANSPORT     "resend" (default) or "mailpit" (local only)
//   RESEND_API_KEY     required for "resend"
//   MAILPIT_SEND_URL   required for "mailpit"

const env = name => Deno.env.get(name) ?? ''

export const escapeHtml = value =>
  String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export async function deliver({ to, subject, text, html }) {
  const from = env('MAIL_FROM')
  const recipients = Array.isArray(to) ? to : [to]
  if (env('MAIL_TRANSPORT') === 'mailpit') {
    const response = await fetch(env('MAILPIT_SEND_URL'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        From: { Email: from.match(/<([^>]+)>/)?.[1] ?? from, Name: from.replace(/\s*<[^>]+>/, '') },
        To: recipients.map(email => ({ Email: email })),
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
    body: JSON.stringify({ from, to: recipients, subject, text, html }),
  })
  if (!response.ok) throw new Error(`resend ${response.status}`)
}
