# Beta access backend (Supabase)

Status: Steps 0a (backend), 0b (website funnel and admin console) and 0c
(sign-in and access gate in the macOS app, see the end of this document).

## What lives here, and what never does

Supabase holds **account and access records only**: waitlist emails, beta
invitations, permanent beta allocations, entitlements, admin membership and an
admin audit log.

Focus sessions, history, scores, camera data, activity data, settings and
exports stay in the local SQLite database on the Mac (`companion/src-tauri/src/db.rs`).
None of them is copied, migrated or uploaded by this work, and no table here
has a column for them. Losing access must never delete, reset or hide local
history; that rule belongs to the app gate (Step 0c) and is restated there.

## Model

| Table | Holds | Who writes |
|---|---|---|
| `beta_program_config` | one row: `capacity` (20), `max_lifetime_capacity` (50, schema-capped), `invitations_paused`, `reservation_hours` (72), `beta_duration_days` (30) | `admin_update_beta_config` |
| `waitlist_entries` | normalized email, optional `source`/`campaign` slugs | `join_waitlist` (anon) |
| `beta_invitations` | email-bound invitation with `expires_at`, `accepted_at`, `revoked_at` | `admin_invite`, `admin_revoke_invitation`, `claim_beta_invitation` |
| `beta_allocations` | the permanent "one lifetime free-beta slot used" record: SHA-256 of the normalized email (no plaintext), account id, invitation, date; unique per email hash and per user | `claim_beta_invitation` only; rows can never be updated, deleted or truncated (trigger, applies to every role) |
| `entitlements` | `beta` / `trial` / `paid` / `internal` access with start, end, revocation; `(source, source_ref)` unique | claim and admin functions; Stripe later |
| `admin_users` | who may run admin functions | SQL as database owner only — no API path grants admin |
| `signup_allowlist` | emails allowed to create an account without an invitation (founder/internal) | SQL as database owner only |
| `admin_audit_log` | every admin mutation and every claim | written inside each function; append-only (trigger) |

States are **derived, never stored** (`private.derive_state`):
`INTERNAL > PAID > TRIAL > BETA` (any active entitlement), else `INVITED`
(live invitation), else `LAPSED` (had access, none active), else `WAITLIST`,
else `NONE`.

### Rules and where they are enforced

- **Capacity** = lifetime allocations + live (unexpired, unaccepted,
  unrevoked) invitations ≤ `capacity`. Checked in `admin_invite` while holding
  a row lock on the config row, so concurrent invites are serialized.
- **Reservation expiry** frees capacity automatically: "live" is evaluated
  against `now()`, so there is no cleanup job.
- **Activation** (`claim_beta_invitation`) never re-checks capacity — the slot
  was reserved at invite time — and records the allocation, accepts the
  invitation and creates a 30-day beta entitlement in one transaction.
- **Lifetime**: an email with an allocation can never be invited again, even
  after expiry, revocation, or deleting and re-creating the account.
  Capacity cannot be lowered below the allocations already consumed.
- **Effective access**: any entitlement that has started, has not ended and
  is not revoked. Overlap is allowed.
- **Invite-only accounts**: the Auth hook `private.before_user_created`
  refuses account creation unless the email has a live invitation or an
  allowlist entry. Joining the waitlist never creates an account.
  Accounts created with the secret key (dashboard "Add user", admin API)
  bypass the hook — verified locally — but receive no entitlement and so no
  access.

## API surface

| Function | Caller | Why it is a function, not a table write |
|---|---|---|
| `join_waitlist(email, source?, campaign?)` | anon | normalizes/validates, treats duplicates as success so the response never reveals membership, keeps anon without table grants |
| `get_my_access()` | user | one server-side access rule using the server clock; returns `server_time` so the app can bound offline grace without trusting the Mac clock |
| `claim_beta_invitation()` | user | the only path to an allocation + beta entitlement; identifies the claimant by the verified account email, never a parameter |
| `admin_invite(email)` | admin | the atomic capacity decision |
| `admin_revoke_invitation(id)` | admin | state transition + audit |
| `admin_update_beta_config(capacity?, paused?)` | admin | shares the capacity lock; refuses capacity below lifetime allocations |
| `admin_extend_entitlement(id, days)` | admin | extends from `max(end, now)`; refuses revoked, open-ended and Stripe-managed rows |
| `admin_revoke_entitlement(id, reason?)` | admin | state transition + audit |
| `admin_grant_internal(user_id)` | admin | one open internal entitlement per user |
| `admin_list_people(search?)` | admin | needs account emails from `auth.users`, which the API roles cannot read |
| view `beta_capacity` | admin (RLS) | capacity, reserved, lifetime allocated, remaining |

Plain reads use RLS directly: a user reads their own `entitlements` and own
`admin_users` row; admins read everything operational. `anon` and
`authenticated` hold **no** INSERT/UPDATE/DELETE privilege on any table, so a
missing or wrong policy still cannot open a write path. Function EXECUTE is
revoked from `public` and granted per function.

## Running the tests (local only)

Requires Docker (Colima) and the Supabase CLI.

```bash
colima start            # once per boot
supabase start          # local stack; applies supabase/migrations
npm run test:db         # pgTAP suite + parallel-session races + end-to-end auth flow
```

`npm run test:db` resets the **local** database (both scripts refuse any
non-local URL). It is not part of `npm test`, so the app's CI is unchanged.

- `supabase/tests/database/*.test.sql` — pgTAP, one rolled-back transaction per file.
- `supabase/tests/concurrency.sh` — real parallel connections racing for the last slot and for one invitation.
- `supabase/tests/auth-flow.mjs` — real Auth + PostgREST + local mail catcher: invite-only sign-up, email codes, claim, REST tampering attempts, refresh, revocation.

## Staging setup (manual, owner only)

Never point these commands at production.

1. Create a Supabase project named `eudaimonai-staging`, region **EU Central
   (Frankfurt)**, Free plan.
2. Link and push migrations:
   ```bash
   supabase link --project-ref <staging-ref>
   supabase db push --linked --dry-run   # review
   supabase db push --linked
   ```
3. Auth settings (Dashboard → Authentication), matching `supabase/config.toml`:
   - Hooks → **Before User Created** → Postgres function `private.before_user_created`.
   - Email → templates "Magic Link" and "Confirm signup": subject and body from
     `supabase/templates/sign-in-code.html` (must contain `{{ .Token }}`).
   - Email OTP expiry: 900 s; email OTP length: 8 (hosted default). Anonymous sign-ins: off. Phone: off.
   `supabase config push` can apply the same values, but the local file also
   carries localhost URLs; run `supabase config diff` and review first.
4. Bootstrap the founder (SQL editor, runs as owner):
   ```sql
   insert into public.signup_allowlist (email_normalized, note) values ('<founder email, lower-case>', 'founder');
   ```
   Sign in once with an email code (any client, or the dashboard's API docs), then:
   ```sql
   insert into public.admin_users (user_id, note)
   select id, 'founder' from auth.users where email = '<founder email>';
   ```
   and grant internal access through the API as that user
   (`admin_grant_internal`), or directly:
   ```sql
   insert into public.entitlements (user_id, kind, source, source_ref)
   select id, 'internal', 'admin', gen_random_uuid()::text from auth.users where email = '<founder email>';
   ```

Supabase's built-in email sender only delivers to members of the Supabase
organization and is heavily rate-limited. That is enough to test staging with
your own addresses; inviting anyone else needs custom SMTP (Resend), which is
Step 0b.

## Known limits (free tier)

- Free projects pause after about a week without activity. Staging may need a
  manual "Restore" before a test session. Production is addressed before the
  first friend (Step 0e).
- `join_waitlist` has no rate limit of its own. A form flood would insert
  junk emails; mitigation (CAPTCHA or an edge check) is a Step 0b decision.

## Step 0b additions

### Website (`src/web/`)

`main.jsx` renders the website instead of the app when not running inside
the native app (`src/web/routes.js`). The website is a separate lazy chunk;
the app's main bundle contains no Supabase code (a test enforces that no app
module imports it).

| Path | Page |
|---|---|
| `/` | landing page; primary action "Request beta access" (waitlist) |
| `/activate` | invitation → 8-digit code → `claim_beta_invitation` → signs out again |
| `/download` | the existing notarized DMG link (`src/lib/downloadLinks.js`) + install/permission steps |
| `/admin` | admin console; sign-in never creates accounts; non-admins see a refusal |

Build-time configuration (all public by design; a secret or service-role key
is refused at build time by `src/web/config.js`):

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the project's `sb_publishable_…` key |
| `VITE_BETA_ENVIRONMENT` | optional badge in the admin console, e.g. `staging` |

Without them the site still renders and says beta requests open soon.

### Abuse protection on `join_waitlist`

Free and inside Postgres: 10 requests per IP per hour (bucket keyed by an
HMAC of the IP with a secret salt; the IP is never stored) and 300 per hour
globally, the hard bound on table growth. The IP comes from `cf-connecting-ip`
(set by Cloudflare in front of Supabase), falling back to `x-forwarded-for`.
The per-IP limit is best-effort if a header can be spoofed; the global cap is
not. A honeypot field on the form drops naive bots client-side. Upgrade path
if needed: Cloudflare Turnstile (free).

### Retained email

The lifetime record stores only a SHA-256 of the normalized email
(pseudonymised: someone who already knows an address can test it). Deleting
an account (dashboard or admin API) triggers
`private.erase_beta_records_for_deleted_account`: the waitlist entry and
unaccepted invitations are deleted, accepted invitations lose their email,
entitlements and admin membership cascade. Audit rows never contain emails.

### Email change

Tested end to end: a pending change grants nothing; after both addresses are
confirmed (Supabase's secure email change) the account owns the new address
and may claim its invitation once; an already-activated account never gets a
second slot by changing its email.

### Invitation email: Edge Function `send-invitation`

`supabase/functions/send-invitation/index.js`, no dependencies, no database
secret. It reads the invitation **with the caller's token**, so PostgREST
verifies the JWT and RLS restricts it to admins (non-admin → 404, no token or
a forged one → 401), refuses invitations that are not live (409), and sends
one email with one link: `SITE_URL/activate?email=…`. `verify_jwt` is off
because the gateway check does not support the new asymmetric signing keys;
the PostgREST read is the authorization.

Secrets per environment (`supabase secrets set`, never in the repo):

| Secret | Staging value |
|---|---|
| `RESEND_API_KEY` | a Resend key with sending access to `mail.eudaimonai.app` only |
| `MAIL_FROM` | `Eudaimonai (staging) <noreply@mail.eudaimonai.app>` |
| `SITE_URL` | the website origin the link should open |
| `MAIL_TRANSPORT` | `resend` |
| `ALLOWED_ORIGINS` | optional extra CORS origins, comma-separated (e.g. a preview URL) |

Locally the function sends to the mail catcher instead (`[edge_runtime.secrets]`
in `config.toml`); it can never reach Resend from a local run.

### Staging rollout of Step 0b (owner-approved, in order)

1. `supabase db push --linked --dry-run`, review, then `supabase db push --linked`
   (migration `20261006090000_beta_web_funnel.sql`).
2. Create a second Resend API key (sending access, `mail.eudaimonai.app` only) and
   set the secrets above with `supabase secrets set --project-ref <ref> …`.
3. `supabase functions deploy send-invitation --project-ref <ref> --no-verify-jwt`.
4. Auth → URL configuration: Site URL = the website origin.
5. Vercel: set the three `VITE_` variables for the environment that should talk to staging.

## Step 0c: the macOS app

Rust owns the beta identity (`companion/src-tauri/src/access/`):

| File | Role |
|---|---|
| `config.rs` | backend URL + publishable key (**staging**), grace constants. A build with `EUDONOMIA_BUILD_CHANNEL=release` refuses to compile while this names staging. |
| `client.rs` | the same Auth/RPC calls as the website, over HTTPS (`ureq`); every failure becomes a short code, never server text |
| `store.rs` | Keychain items `beta-auth-session` (tokens) and `beta-access-cache` (last verification, pending waitlist email, clock high-water mark), service `ai.eudonomia.companion` |
| `grace.rs` | the access decision from the last server answer and the clock (pure, tested) |
| `gate.rs` | which native actions need access (pure, tested) |
| `mod.rs` | `AccessManager`, Tauri commands `access_*`, the gated `start_native_camera_prototype`, background checks |

- **One identity.** Request access calls `join_waitlist` (source `macos_app`);
  "I already have access" sends an 8-digit code; an invited person is
  activated (`claim_beta_invitation`) during sign-in. The founder uses the
  same flow.
- **Gate.** `set_companion_session` refuses only the switch from "no session"
  to "session" without access; lease renewals and every deactivation pass.
  The camera starts with access, or inside a running session (restarts after
  sleep or a fault). History, export and stop commands are never gated.
- **Checks.** At launch, hourly, after a network failure every 2 minutes, and
  in the UI right before a session starts when the last verification is older
  than 15 minutes.
- **Offline grace.** Up to 72 h after the last server answer, never past the
  entitlement's end. Time since that answer is measured on the Mac's clock;
  a clock more than 5 minutes behind the answer or behind the highest time the
  app has seen is a rollback and requires going online. A server "no" or a
  rejected session applies at once, with no grace.
- **Without access** the app shows the access step; an install with local
  history can open it strictly read-only (Analytics: view and export; writes
  are refused in `AnalyticsShell`).
- **Data boundary.** The access module never references the session database
  (source-checked test), and `access_history_tests.rs` runs every access
  transition over a real on-disk database and compares it byte for byte.

Tests: `cargo test` (unit, gate, history), `npm run test:app-access` (the real
client against the local stack), `npm test` (screens and gate rules).
