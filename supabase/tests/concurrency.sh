#!/usr/bin/env bash
# Races real parallel database sessions against the capacity and claim logic.
# pgTAP runs each file in one transaction, so it cannot prove what happens
# when two connections commit at the same moment; this does.
#
# LOCAL ONLY: it resets the local Supabase database before and after running.
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:54322/*|*@localhost:54322/*) ;;
  *) echo "Refusing to run against a non-local database: $DB_URL" >&2; exit 2 ;;
esac

PSQL="${PSQL:-$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

q() { "$PSQL" "$DB_URL" -X -q -t -A -v ON_ERROR_STOP=1 -c "$1"; }

# Runs SQL as an authenticated user in its own session. Never fails the
# script: the outcome is read back from the database afterwards.
as_user() { # email, sql, outfile
  "$PSQL" "$DB_URL" -X -q -t -A -v ON_ERROR_STOP=1 >"$3" 2>&1 <<SQL || true
select set_config('request.jwt.claims',
  (select json_build_object('sub', id, 'email', email, 'role', 'authenticated')::text from auth.users where email = '$1'), false);
set role authenticated;
$2
SQL
}

fail=0
check() { # description, expected, actual
  if [ "$2" = "$3" ]; then echo "ok - $1"; else echo "not ok - $1 (expected $2, got $3)"; fail=1; fi
}

# Lifetime allocations + live reservations, read as the owner (no RLS).
used() {
  q "select (select count(*) from public.beta_allocations)
          + (select count(*) from public.beta_invitations
              where accepted_at is null and revoked_at is null and expires_at > now())"
}

(cd "$ROOT" && supabase db reset >/dev/null 2>&1)

new_user() {
  q "insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '$1', now(), '{}', '{}', now(), now())
     returning id" >/dev/null
}
new_user founder@example.com
new_user cofounder@example.com
q "insert into public.admin_users (user_id) select id from auth.users where email in ('founder@example.com', 'cofounder@example.com')" >/dev/null

# ── 1. Two admins invite for the final slot, forced to overlap ────────────
# Capacity 20 with 19 slots consumed by reservations: exactly one left.
for i in $(seq 1 19); do
  as_user founder@example.com "select public.admin_invite('filler$i@example.com');" "$WORK/fill$i"
done
check "setup: 19 of 20 reserved" "1" "$(q "select remaining from public.beta_capacity")"

# Session A takes the lock and holds it for 2 s before committing; session B
# starts while A is still open.
as_user founder@example.com "begin; select public.admin_invite('race-a@example.com'); select pg_sleep(2); commit;" "$WORK/race-a" &
sleep 0.5
as_user cofounder@example.com "select public.admin_invite('race-b@example.com');" "$WORK/race-b" &
wait
check "overlapping invites for the final slot: exactly one succeeds" "1" \
  "$(q "select count(*) from public.beta_invitations where email_normalized in ('race-a@example.com','race-b@example.com')")"
check "the waiting session sees capacity_exhausted" "1" "$(grep -c capacity_exhausted "$WORK/race-b" || true)"
check "capacity never exceeded" "20" "$(used)"

# ── 2. Burst: 25 simultaneous invites against 3 free slots ────────────────
q "update public.beta_program_config set capacity = 23" >/dev/null
for i in $(seq 1 25); do
  as_user founder@example.com "select public.admin_invite('burst$i@example.com');" "$WORK/burst$i" &
done
wait
check "burst of 25 invites against 3 free slots: exactly 3 succeed" "3" \
  "$(q "select count(*) from public.beta_invitations where email_normalized like 'burst%'")"
check "burst: 22 refused with capacity_exhausted" "22" "$(cat "$WORK"/burst* | grep -c capacity_exhausted || true)"
check "burst: total used equals capacity exactly" "23" \
  "$(used)"

# ── 3. The same invitee claims from two sessions at once ──────────────────
new_user race-a@example.com
new_user intruder@example.com
as_user race-a@example.com "begin; select public.claim_beta_invitation(); select pg_sleep(2); commit;" "$WORK/claim-1" &
sleep 0.5
as_user race-a@example.com "select public.claim_beta_invitation();" "$WORK/claim-2" &
as_user intruder@example.com "select public.claim_beta_invitation();" "$WORK/claim-3" &
wait
check "two concurrent claims of one invitation: one allocation" "1" \
  "$(q "select count(*) from public.beta_allocations where email_hash = private.email_hash('race-a@example.com')")"
check "two concurrent claims of one invitation: one entitlement" "1" \
  "$(q "select count(*) from public.entitlements e join auth.users u on u.id = e.user_id where u.email = 'race-a@example.com'")"
check "the second claim is refused as already_activated" "1" "$(grep -c already_activated "$WORK/claim-2" || true)"
check "a different account racing for that invitation gets nothing" "1" "$(grep -c no_valid_invitation "$WORK/claim-3" || true)"

# ── 4. Burst of claims: 10 sessions, same invitee ─────────────────────────
# Which burst invites won is random; claim with one that actually did.
claimant="$(q "select email_normalized from public.beta_invitations where email_normalized like 'burst%' order by 1 limit 1")"
new_user "$claimant"
for i in $(seq 1 10); do
  as_user "$claimant" "select public.claim_beta_invitation();" "$WORK/bclaim$i" &
done
wait
check "10 simultaneous claims: one allocation" "1" \
  "$(q "select count(*) from public.beta_allocations where email_hash = private.email_hash('$claimant')")"
check "10 simultaneous claims: 9 refused" "9" "$(cat "$WORK"/bclaim* | grep -c already_activated || true)"
check "lifetime allocations + reservations still equal capacity" "23" \
  "$(used)"

(cd "$ROOT" && supabase db reset >/dev/null 2>&1)

if [ "$fail" -ne 0 ]; then echo "FAIL"; exit 1; fi
echo "PASS"
