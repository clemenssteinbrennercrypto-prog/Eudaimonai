# Closed-beta launch runbook (Saturday sprint → Sunday release)

Prepared 7 October 2026. Read "Starting point" first: re-verify it before step 1.

## Starting point (verified 7 Oct 2026)

| Item | State |
|---|---|
| PR #67 (backend + website) | open, head `8897411`, CI green, **merges cleanly** onto current `main` |
| PR #71 (app gate, draft, stacked on #67) | head `175368f` (pushed 7 Oct 15:27 UTC), CI green on `8628a5e`; **2 conflicts** with current `main`: `docs/release-readiness-2026-09-02.md` (both appended) and `src/components/analytics/AnalyticsStory.jsx` (main added `<PersonalRecordsPanel>` next to the read-only guard — keep both). `main.rs`, `App.jsx`, `nativeCompanion.js` auto-merge but must be rebuilt and tested (main added `tauri-plugin-notification`). |
| `main` | `3265882` (#68–#77 since our base) |
| Staging (`zlsxzgzfwqqjmwtxmxnj`, Frankfurt, Free) | both migrations applied; `remote-verify.sql` 55/55; `send-invitation` ACTIVE v1; secrets `MAIL_FROM`, `MAIL_TRANSPORT=resend`, `SITE_URL`=#71 preview; **`RESEND_API_KEY` missing**; data: founder only (INTERNAL) |
| Website previews | #67 and #71 previews exist, behind Vercel Authentication; **no `VITE_` variables yet** → funnel shows "Beta requests open soon" |
| `eudaimonai.app` | serves `main`; download button → `internal-test` DMG (updated in place by every `main` build; today's build is `3265882`) |
| Production release | none published yet; non-publishing release dry run passed 3 Oct; `production-release` environment requires your approval |
| MacBook | test build at `~/Applications/Eudaimonai-0c-test/` (signed out); backup `~/EudaimonaiBackup-20261006-155155` (96 sessions; now 97 live) |

## Things that expire or go stale before Saturday

- **Nothing expires.** Supabase CLI login and GitHub auth are long-lived;
  staging only pauses after ~7 days without activity (last activity 7 Oct).
- **Needs a refresh on Saturday (do not do earlier):**
  - Rebase #67 and #71 onto `main` → new CI runs and new previews.
  - The `VITE_` variables only reach a preview after a rebuild (the rebase push does it).
  - The 0c test ZIP is built from `8628a5e` (pre-rebase). It is still fine
    for the staging E2E (same RPCs); the production build replaces it anyway.
  - Re-run `supabase/checks/remote-verify.sql` before relying on staging.

## Only you can do

1. **Resend staging key** — Resend → API Keys → `supabase-staging-invites`,
   Sending access, domain `mail.eudaimonai.app`; then on the Mac mini:
   `read -rs RESEND_API_KEY && supabase secrets set --project-ref zlsxzgzfwqqjmwtxmxnj RESEND_API_KEY="$RESEND_API_KEY"; unset RESEND_API_KEY`
2. **Vercel Preview variables** (Preview only, not Production):
   `VITE_SUPABASE_URL=https://zlsxzgzfwqqjmwtxmxnj.supabase.co`,
   `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_vewGlWpyphsmObhgvsbZMA_79SiDHkZ`,
   `VITE_BETA_ENVIRONMENT=staging`.
3. Later: create the production Supabase project, the production Resend key,
   Supabase dashboard Auth settings, Vercel **Production** variables,
   approving the `production-release` environment, merging the PRs.
4. **Legal (blocks the first external user):** the `TODO(legal)` block in
   `src/components/LegalModal.jsx` — legal bases, US-transfer wording
   (Supabase, Resend, Vercel), whether to promise a retention period.

## Saturday runbook

### A. Re-verify (Claude, read-only, 5 min)
1. `git fetch`; PR states; `git merge-tree` for both branches against `main`.
2. Staging: `supabase migration list --linked`, `functions list`, `secrets list` (names), `remote-verify.sql`.

### B. Finish staging (you → Claude)
3. You: Resend staging key + Vercel Preview variables (above).
4. Claude: confirm `RESEND_API_KEY` exists (name only).
5. Claude: rebase #67 onto `main`, then #71 onto #67; resolve the two known
   conflicts; run `npm test`, lint, coverage, build, `cargo test`,
   `npm run test:db`, `npm run test:app-access`; force-push both
   (`--force-with-lease`); trigger Quality on #71 (`gh workflow run ci.yml --ref beta-access/app-gate`).
6. Claude: check the #71 preview landing shows the request form (needs your
   Vercel login in the browser; Claude cannot pass the protection).

### C. Staging end-to-end (you, Claude checks read-only)
7. Preview `/admin` → founder code sign-in → capacity 20/20.
8. Invite `clemenssteinbrenner.crypto+friend1@gmail.com` → email from
   "Eudaimonai (staging)" via Resend → link opens preview `/activate`.
9. Activate (8-digit code) → BETA 30 days; admin shows BETA.
10. MacBook test app: sign in as `+friend1` → BETA → a session may start;
    optional: revoke in admin → next check blocks.
11. Preview landing: request access as `+friend2` → admin shows WAITLIST + source.
12. Claude: rate-limit bucket on staging is an HMAC, not `unknown`
    (proves the IP header reaches Postgres); `remote-verify.sql` again.
**Gate:** all pass → production. Any failure → fix on staging first.

### D. Production backend (you + Claude)
13. You: create `eudaimonai-production`, Frankfurt, Free (2nd and last free project).
14. Claude: `supabase link --project-ref <prod>` (you type the DB password),
    `db push --dry-run` (expect exactly the two migrations), `db push`,
    `remote-verify.sql` minus the founder check, advisors (only the
    documented findings).
15. You (Resend): key `supabase-production-smtp` (SMTP) and
    `supabase-production-invites` (function), same domain `mail.eudaimonai.app`
    (Free plan allows one domain; both environments share it).
16. You (dashboard, in this order): custom SMTP (sender name "Eudaimonai") →
    templates "Magic link" + "Confirm signup" from `supabase/templates/sign-in-code.html`
    → hook `private.before_user_created` → OTP expiry 900, length 8 →
    Site URL `https://eudaimonai.app`.
17. Claude: function secrets (`MAIL_TRANSPORT=resend`, `MAIL_FROM=Eudaimonai <noreply@mail.eudaimonai.app>`,
    `SITE_URL=https://eudaimonai.app`, optional `ALLOWED_ORIGINS=https://www.eudaimonai.app`);
    you: `RESEND_API_KEY` (hidden input); Claude: deploy `send-invitation`, probe it.
    Never use `supabase config push` (local config holds localhost values).
18. Founder bootstrap on production (same as staging): allowlist SQL →
    you sign in once via `/activate` on a production-backed build or the
    one-time script → `admin_users` row → INTERNAL via `admin_grant_internal`.
19. Claude: `config diff` read-only; `remote-verify.sql` 100 % pass.

### E. Production app configuration (Claude, code)
20. Change `companion/src-tauri/src/access/config.rs` from "staging, and
    refuse release builds" to "staging for local/test builds, production for
    `release` builds" (cfg `eudaimonai_release_build`), so `internal-test`
    keeps talking to staging and only the signed release talks to production.
    Keep a compile-time refusal if the production values are missing. Tests +
    `EUDONOMIA_BUILD_CHANNEL=release cargo check`.
21. Predicted release asset: `Eudaimonai-<version>-aarch64.dmg` (workflow
    pattern `[name]-[version]-[arch][ext]`). Set `src/lib/downloadLinks.js` to
    `…/releases/download/release-v<version>/Eudaimonai-<version>-aarch64.dmg`
    and update `src/lib/updateChannels.test.js`. Verify the name against the
    real asset in step 25 before inviting anyone.

### F. Sunday release
22. You: Vercel **Production** variables (production URL, production
    publishable key, `VITE_BETA_ENVIRONMENT` empty or `production`) — before merging.
23. You: merge #67, then #71 (after its rebase onto the new `main`).
    Triggers: Vercel production deploy of `eudaimonai.app`; `companion-test.yml`
    replaces `internal-test` with the gated build (staging backend).
24. You: tag `release-v<version>` on the merged `main` commit → `companion-release.yml`
    builds, signs, notarizes, staples, verifies → you approve `production-release`
    → published as latest.
25. Claude: verify the release (asset name, Gatekeeper, arm64, updater
    signature, `latest.json`) and that the website download link resolves to it.
26. Final smoke test on the MacBook with the production DMG: install over the
    test build, history intact (97+), founder sign-in → INTERNAL, one real
    session, restart, sign out, read-only history; website request → admin →
    invite your `+friend3` → activate → app sign-in → BETA.
27. Invite the first 2 friends from `/admin`; watch admin and Resend logs.
    Expand toward 20 only per the release document's gates.

## Realistic blockers for a Sunday release

1. **Legal TODOs** — your rule: no external account before the policy is accurate.
2. **First real production release** — never published through the pipeline
   yet (dry run passed); notarization can take from minutes to hours.
3. **Manual dashboard work on production** (SMTP before templates, hook,
   OTP settings) — ~30 min, error-prone if rushed; `config diff` checks it.
4. **Merge side effects** — `internal-test` installs (yours, any old friends-test
   installs) receive the gated build pointing at staging.
5. **Rebase onto a moving `main`** — main changed scoring and added a Tauri
   plugin; the final smoke test covers it, but plan time for one more CI round.
