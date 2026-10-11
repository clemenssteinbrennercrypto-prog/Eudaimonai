// Sends the founder digest: "n new access requests, m activations".
//
// Called only by the database (private.send_founder_digest via pg_cron and
// pg_net), never by a browser. The database proves itself with a shared token
// kept in Vault on its side and in this function's secrets here. The function
// holds no database key and reads nothing: the counts and the admin addresses
// arrive in the request. It never receives a requester's address.
//
// Environment:
//   FOUNDER_DIGEST_TOKEN              shared with the database's Vault
//   SITE_URL                          public website origin, e.g. https://eudaimonai.app
//   MAIL_FROM, MAIL_TRANSPORT, ...    see ../_shared/mail.js

import { deliver, escapeHtml } from '../_shared/mail.js'

const env = name => Deno.env.get(name) ?? ''
const TOKEN = env('FOUNDER_DIGEST_TOKEN')
const SITE_URL = env('SITE_URL').replace(/\/+$/, '')
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SOURCE = /^[a-z0-9_.-]{1,64}$/

const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function sameToken(given, expected) {
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(expected)
  let difference = a.length ^ b.length
  for (let i = 0; i < b.length; i += 1) difference |= (a[i] ?? 0) ^ b[i]
  return difference === 0
}

const count = value => (Number.isInteger(value) && value >= 0 ? value : null)
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export function parseDigest(body) {
  const digest = {
    newRequests: count(body?.new_requests),
    newActivations: count(body?.new_activations),
    waiting: count(body?.waiting),
    remaining: count(body?.remaining),
    since: new Date(body?.since),
    recipients: Array.isArray(body?.recipients) ? body.recipients : [],
    sources: Object.entries(body?.sources ?? {}).filter(([name, n]) => SOURCE.test(name) && count(n) !== null),
  }
  const valid = digest.newRequests !== null && digest.newActivations !== null && digest.waiting !== null
    && digest.remaining !== null && !Number.isNaN(digest.since.getTime())
    && digest.newRequests + digest.newActivations > 0
    && digest.recipients.length > 0 && digest.recipients.length <= 10
    && digest.recipients.every(email => typeof email === 'string' && EMAIL.test(email))
  return valid ? digest : null
}

export function digestEmail(digest, siteUrl) {
  const parts = []
  if (digest.newRequests) parts.push(plural(digest.newRequests, 'new access request', 'new access requests'))
  if (digest.newActivations) parts.push(plural(digest.newActivations, 'activation', 'activations'))
  const headline = parts.join(' and ')
  const since = digest.since.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna', timeZoneName: 'short',
  })
  const link = `${siteUrl}/admin`
  const facts = [
    ['Waiting for an invitation', String(digest.waiting)],
    ['Places remaining', String(digest.remaining)],
    ...(digest.sources.length
      ? [['New requests by source', digest.sources.map(([name, n]) => `${name} ${n}`).join(', ')]]
      : []),
  ]
  const subject = `Beta: ${headline}`
  const text = [
    `${headline[0].toUpperCase()}${headline.slice(1)} since ${since}.`,
    '',
    ...facts.map(([label, value]) => `${label}: ${value}`),
    '',
    `Review and invite: ${link}`,
    '',
    'This summary contains no requester addresses. It comes at most every 15 minutes, and only when something new arrived.',
  ].join('\n')
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
  <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin:0 0 12px">Eudaimonai · Beta admin</p>
  <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px">${escapeHtml(headline[0].toUpperCase() + headline.slice(1))}</h1>
  <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0 0 20px">Since ${escapeHtml(since)}.</p>
  <table style="font-size:15px;line-height:1.6;border-collapse:collapse;margin:0 0 24px">
    ${facts.map(([label, value]) => `<tr><td style="padding:2px 16px 2px 0;color:#6b7280">${escapeHtml(label)}</td><td style="padding:2px 0;font-weight:600">${escapeHtml(value)}</td></tr>`).join('\n    ')}
  </table>
  <p style="margin:0 0 28px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#2C46FF;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px">Review and invite</a></p>
  <p style="font-size:12px;line-height:1.6;color:#9ca3af;margin:0">This summary contains no requester addresses. It comes at most every 15 minutes, and only when something new arrived.</p>
</div></body></html>`
  return { subject, text, html }
}

Deno.serve(async req => {
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  if (!TOKEN || !SITE_URL || !env('MAIL_FROM')) return reply(500, { error: 'not_configured' })
  if (!sameToken(req.headers.get('x-digest-token') ?? '', TOKEN)) return reply(401, { error: 'not_authorized' })

  const digest = parseDigest(await req.json().catch(() => null))
  if (!digest) return reply(400, { error: 'invalid_digest' })

  try {
    await deliver({ to: digest.recipients, ...digestEmail(digest, SITE_URL) })
  } catch (error) {
    console.error('founder digest failed', error.message)
    return reply(502, { error: 'email_failed' })
  }
  return reply(200, { sent: true })
})
