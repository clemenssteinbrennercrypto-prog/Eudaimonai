// End-to-end check of the founder digest through the real local stack:
// database job → pg_net → Edge Function founder-digest → Mailpit.
//
// LOCAL ONLY. Run with: node supabase/tests/founder-digest.mjs
// It resets the local database before and after.
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
const DB_URL = env.DB_URL
if (!/^http:\/\/127\.0\.0\.1:/.test(API) || !DB_URL.includes('@127.0.0.1:')) {
  console.error(`Refusing to run against a non-local stack: ${API}`)
  process.exit(2)
}

const psql = process.env.PSQL || '/opt/homebrew/opt/libpq/bin/psql'
const sql = query => execFileSync(psql, [DB_URL, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8' }).trim()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

let failures = 0
const check = (description, condition, detail = '') => {
  console.log(`${condition ? 'ok' : 'not ok'} - ${description}${condition || !detail ? '' : ` (${detail})`}`)
  if (!condition) failures += 1
}

const LOCAL_TOKEN = 'local-only-founder-digest-token' // supabase/functions/.env
const FOUNDER = 'digest-founder@example.com'
const digest = (body, headers = {}) => fetch(`${API}/functions/v1/founder-digest`, {
  method: 'POST',
  headers: { apikey: PUBLISHABLE, 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
})
const valid = {
  new_requests: 1, new_activations: 0, sources: { reddit: 1 }, waiting: 1, remaining: 20,
  since: new Date().toISOString(), until: new Date().toISOString(), recipients: [FOUNDER],
}

async function messagesTo(email) {
  const search = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then(r => r.json())
  return Promise.all((search.messages ?? []).map(m => fetch(`${MAIL}/api/v1/message/${m.ID}`).then(r => r.json())))
}

execFileSync('supabase', ['db', 'reset'], { cwd: root, stdio: 'ignore' })
await fetch(`${MAIL}/api/v1/messages`, { method: 'DELETE' })

// ── 1. The function refuses everyone but the database ────────────────────
check('GET is refused', (await fetch(`${API}/functions/v1/founder-digest`, { headers: { apikey: PUBLISHABLE } })).status === 405)
check('no token is refused', (await digest(valid)).status === 401)
check('a wrong token is refused', (await digest(valid, { 'x-digest-token': 'guess' })).status === 401)
check('a token prefix is refused', (await digest(valid, { 'x-digest-token': LOCAL_TOKEN.slice(0, -1) })).status === 401)
check('a malformed digest is refused', (await digest({ ...valid, recipients: ['not-an-email'] }, { 'x-digest-token': LOCAL_TOKEN })).status === 400)
check('an empty digest is refused', (await digest({ ...valid, new_requests: 0 }, { 'x-digest-token': LOCAL_TOKEN })).status === 400)
check('no mail was sent by refused calls', (await messagesTo(FOUNDER)).length === 0)

// ── 2. Real path: waitlist request → job → pg_net → function → mail ──────
sql(`insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${FOUNDER}', now(), now(), now());
     insert into public.admin_users (user_id) select id from auth.users where email = '${FOUNDER}';
     select vault.create_secret('http://supabase_kong_eudaimonai:8000/functions/v1/founder-digest', 'founder_digest_url');
     select vault.create_secret('${LOCAL_TOKEN}', 'founder_digest_token');`)

const requester = 'digest-requester@example.com'
const joined = await fetch(`${API}/rest/v1/rpc/join_waitlist`, {
  method: 'POST',
  headers: { apikey: PUBLISHABLE, 'content-type': 'application/json' },
  body: JSON.stringify({ p_email: requester, p_source: 'reddit', p_campaign: null }),
})
check('a visitor joins the waitlist', joined.status === 200 || joined.status === 204, `${joined.status}`)

const requestId = sql('select private.send_founder_digest()')
check('the job queues one digest', /^\d+$/.test(requestId), requestId)

let status = ''
for (let attempt = 0; attempt < 40 && !status; attempt += 1) {
  await sleep(250)
  status = sql(`select coalesce(status_code::text, error_msg, '') from net._http_response where id = ${requestId}`)
}
check('the function accepted the digest', status === '200', status)

let mail = []
for (let attempt = 0; attempt < 20 && !mail.length; attempt += 1) {
  mail = await messagesTo(FOUNDER)
  if (!mail.length) await sleep(250)
}
const [message] = mail
check('the founder gets one email', mail.length === 1, `${mail.length}`)
check('subject names the new request', message?.Subject === 'Beta: 1 new access request', message?.Subject)
check('it links to the admin console', /\/admin\b/.test(message?.Text ?? ''), message?.Text)
check('it states waiting and remaining places', /Waiting for an invitation: 1/.test(message?.Text) && /Places remaining: 20/.test(message?.Text), message?.Text)
check('it never contains the requester address', !`${message?.Text} ${message?.HTML}`.includes(requester))
check('the requester gets nothing', (await messagesTo(requester)).length === 0)

check('nothing new: the next run sends nothing', sql('select private.send_founder_digest()') === '')

execFileSync('supabase', ['db', 'reset'], { cwd: root, stdio: 'ignore' })
console.log(failures ? `FAIL (${failures})` : 'PASS')
process.exit(failures ? 1 : 0)
