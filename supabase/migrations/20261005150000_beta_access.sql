-- Eudaimonai closed beta: waitlist, invitations, lifetime beta allocations,
-- entitlements and admin authorization.
--
-- Scope boundary: this database holds account and access records only. Focus
-- sessions, history, camera data and activity data stay in the local SQLite
-- database on the user's Mac and must never be added here.
--
-- Security model in one paragraph: RLS is on for every table. anon and
-- authenticated get no write privilege on any table. Reads go through RLS
-- (own entitlements, admin-only for everything operational). Every mutation is
-- a SECURITY DEFINER function that authorizes the caller itself, so frontend
-- visibility is never the authorization. See docs/beta-access-backend.md.
--
-- Lifecycle states (WAITLIST, INVITED, BETA, TRIAL, PAID, INTERNAL) are never
-- stored. They are derived from these records by private.derive_state().

create schema if not exists private;
revoke all on schema private from public;
-- authenticated needs usage so RLS policies can call private.is_admin();
-- `private` is not in the API's exposed schemas, so nothing here is reachable
-- over HTTP.
grant usage on schema private to authenticated, supabase_auth_admin;

-- ── Helpers ───────────────────────────────────────────────────────────────

-- Lower-case + trim only. Gmail dots and +tags are deliberately NOT folded:
-- invitations are founder-issued by hand, so the abuse that folding prevents
-- does not exist here, and folding would refuse legitimate distinct addresses.
create function private.normalize_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$ select lower(btrim(p_email)) $$;

create function private.is_valid_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_email is not null
     and char_length(p_email) between 3 and 254
     and p_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
$$;

-- ── Tables ────────────────────────────────────────────────────────────────

-- Exactly one row. capacity is the operator's current lifetime cap; the
-- planned maximum of 50 is a schema constraint, so raising it past 50 takes a
-- reviewed migration rather than a click.
create table public.beta_program_config (
  id boolean primary key default true check (id),
  capacity integer not null default 20,
  max_lifetime_capacity integer not null default 50 check (max_lifetime_capacity between 0 and 50),
  invitations_paused boolean not null default false,
  reservation_hours integer not null default 72 check (reservation_hours between 1 and 720),
  beta_duration_days integer not null default 30 check (beta_duration_days between 1 and 365),
  updated_at timestamptz not null default now(),
  constraint capacity_within_lifetime_max check (capacity between 0 and max_lifetime_capacity)
);
insert into public.beta_program_config default values;

-- Interest only. A waitlist row never grants access and never creates an
-- account. No verification here: the email is proven at activation.
create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null unique
    check (email_normalized = private.normalize_email(email_normalized) and private.is_valid_email(email_normalized)),
  source text check (source ~ '^[a-z0-9_.-]{1,64}$'),
  campaign text check (campaign ~ '^[a-z0-9_.-]{1,64}$'),
  created_at timestamptz not null default now()
);

-- Founder-issued, bound to one email. "Live" = not accepted, not revoked and
-- not past expires_at. Expiry is evaluated against now() wherever it matters,
-- so an expired reservation frees its capacity without any cleanup job.
-- Actor columns are plain uuids (no FK) so deleting an account never rewrites
-- this history.
create table public.beta_invitations (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null
    check (email_normalized = private.normalize_email(email_normalized) and private.is_valid_email(email_normalized)),
  invited_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  constraint expires_after_creation check (expires_at > created_at),
  constraint accepted_or_revoked_not_both check (accepted_at is null or revoked_at is null)
);
create index beta_invitations_email_idx on public.beta_invitations (email_normalized);
create unique index beta_invitations_one_accepted_per_email
  on public.beta_invitations (email_normalized) where accepted_at is not null;

-- The permanent record that one lifetime free-beta slot was consumed. Keyed by
-- email as well as user so that deleting and re-creating an account cannot
-- earn a second free allocation. Rows are immutable (trigger below).
create table public.beta_allocations (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null unique,
  user_id uuid not null unique,
  invitation_id uuid not null unique references public.beta_invitations (id),
  allocated_at timestamptz not null default now()
);

create type public.entitlement_kind as enum ('beta', 'trial', 'paid', 'internal');

-- Server-managed access rights. Effective access = any entitlement that has
-- started, has not ended and is not revoked. (source, source_ref) is the
-- idempotency key: one beta allocation, one future Stripe subscription or one
-- admin grant can only ever produce one row.
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.entitlement_kind not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text check (char_length(revoke_reason) <= 500),
  source text not null check (source in ('beta_allocation', 'admin', 'stripe')),
  source_ref text not null check (char_length(source_ref) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entitlements_source_once unique (source, source_ref),
  constraint ends_after_start check (ends_at is null or ends_at > starts_at),
  constraint beta_is_time_limited_allocation check (kind <> 'beta' or (source = 'beta_allocation' and ends_at is not null)),
  constraint paid_comes_from_stripe check (kind <> 'paid' or source = 'stripe'),
  constraint allocation_only_grants_beta check (source <> 'beta_allocation' or kind = 'beta')
);
create index entitlements_user_idx on public.entitlements (user_id);
create unique index entitlements_one_beta_per_user
  on public.entitlements (user_id) where kind = 'beta';
create unique index entitlements_one_open_internal_per_user
  on public.entitlements (user_id) where kind = 'internal' and revoked_at is null;

-- Admins are added only by SQL run as the database owner (dashboard SQL
-- editor or a migration). There is deliberately no function that grants it.
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);

-- Signup allowance for internal/founder accounts that are not beta invitees.
-- Read only by the before-user-created hook.
create table public.signup_allowlist (
  email_normalized text primary key
    check (email_normalized = private.normalize_email(email_normalized) and private.is_valid_email(email_normalized)),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);

-- Append-only (trigger below).
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ── Immutability of the lifetime record and the audit log ────────────────
-- Applies to every role, including the service role and the dashboard.

create function private.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are permanent and cannot be % ', tg_table_name, lower(tg_op)
    using errcode = '42501';
end;
$$;

create trigger beta_allocations_permanent
  before update or delete on public.beta_allocations
  for each row execute function private.forbid_change();
create trigger beta_allocations_no_truncate
  before truncate on public.beta_allocations
  for each statement execute function private.forbid_change();
create trigger admin_audit_log_append_only
  before update or delete on public.admin_audit_log
  for each row execute function private.forbid_change();
create trigger admin_audit_log_no_truncate
  before truncate on public.admin_audit_log
  for each statement execute function private.forbid_change();

-- ── Privileges ────────────────────────────────────────────────────────────
-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated. Take that back so RLS is not the only wall: without a
-- grant, a missing or wrong policy still cannot open a write path.

revoke all on public.beta_program_config, public.waitlist_entries, public.beta_invitations,
  public.beta_allocations, public.entitlements, public.admin_users, public.signup_allowlist,
  public.admin_audit_log
  from anon, authenticated;

grant select on public.beta_program_config, public.waitlist_entries, public.beta_invitations,
  public.beta_allocations, public.entitlements, public.admin_users, public.admin_audit_log
  to authenticated;

alter table public.beta_program_config enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.beta_invitations enable row level security;
alter table public.beta_allocations enable row level security;
alter table public.entitlements enable row level security;
alter table public.admin_users enable row level security;
alter table public.signup_allowlist enable row level security;
alter table public.admin_audit_log enable row level security;

-- SECURITY DEFINER so the policy check does not recurse through admin_users'
-- own RLS.
create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()))
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create policy "admins read beta config" on public.beta_program_config
  for select to authenticated using ((select private.is_admin()));
create policy "admins read waitlist" on public.waitlist_entries
  for select to authenticated using ((select private.is_admin()));
create policy "admins read invitations" on public.beta_invitations
  for select to authenticated using ((select private.is_admin()));
create policy "admins read allocations" on public.beta_allocations
  for select to authenticated using ((select private.is_admin()));
create policy "users read own entitlements, admins read all" on public.entitlements
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "users see own admin row, admins see all" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "admins read audit log" on public.admin_audit_log
  for select to authenticated using ((select private.is_admin()));
-- signup_allowlist: no policy and no grant. Hook and owner only.

-- ── Internal helpers ──────────────────────────────────────────────────────

create function private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.admin_users where user_id = v_uid) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create function private.audit(p_actor uuid, p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit_log (actor, action, target_type, target_id, details)
  values (p_actor, p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb))
$$;

create function private.live_reservation_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.beta_invitations
  where accepted_at is null and revoked_at is null and expires_at > now()
$$;

create function private.entitlement_is_active(e public.entitlements)
returns boolean
language sql
stable
set search_path = ''
as $$
  select e.revoked_at is null and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())
$$;

-- The one place lifecycle state is derived. Highest-value active access wins;
-- otherwise the person's position in the funnel.
--   INTERNAL > PAID > TRIAL > BETA   any active entitlement of that kind
--   INVITED                          a live invitation, no active access
--   LAPSED                           had an entitlement or allocation, none active now
--   WAITLIST                         only a waitlist entry
--   NONE                             nothing on record
create function private.derive_state(p_email_normalized text, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with active as (
    select e.kind from public.entitlements e
    where p_user_id is not null and e.user_id = p_user_id and private.entitlement_is_active(e)
  )
  select case
    when exists (select 1 from active where kind = 'internal') then 'INTERNAL'
    when exists (select 1 from active where kind = 'paid') then 'PAID'
    when exists (select 1 from active where kind = 'trial') then 'TRIAL'
    when exists (select 1 from active where kind = 'beta') then 'BETA'
    when exists (
      select 1 from public.beta_invitations i
      where i.email_normalized = p_email_normalized
        and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    ) then 'INVITED'
    when exists (select 1 from public.entitlements e where p_user_id is not null and e.user_id = p_user_id)
      or exists (select 1 from public.beta_allocations a where a.email_normalized = p_email_normalized)
      then 'LAPSED'
    when exists (select 1 from public.waitlist_entries w where w.email_normalized = p_email_normalized) then 'WAITLIST'
    else 'NONE'
  end
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

-- ── Public operations ─────────────────────────────────────────────────────

-- Why a function and not a direct INSERT: it normalizes and validates the
-- email, treats a duplicate as success so the response never reveals whether
-- an address is already on the list, and keeps anon without any table grant.
create function public.join_waitlist(p_email text, p_source text default null, p_campaign text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := private.normalize_email(p_email);
begin
  if not private.is_valid_email(v_email) then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if p_source is not null and p_source !~ '^[a-z0-9_.-]{1,64}$' then
    raise exception 'invalid_source' using errcode = '22023';
  end if;
  if p_campaign is not null and p_campaign !~ '^[a-z0-9_.-]{1,64}$' then
    raise exception 'invalid_campaign' using errcode = '22023';
  end if;
  insert into public.waitlist_entries (email_normalized, source, campaign)
  values (v_email, p_source, p_campaign)
  on conflict (email_normalized) do nothing;
end;
$$;

-- Why a function: the caller's state is decided with the server's clock and
-- one shared rule, and server_time lets the app bound its offline grace
-- without trusting the Mac's clock. SECURITY DEFINER only so it can use the
-- private helpers; every read is filtered to auth.uid() and its account email.
create function public.get_my_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := (select private.normalize_email(u.email) from auth.users u where u.id = v_uid);
  v_active jsonb;
  v_open_ended boolean;
  v_until timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'starts_at', e.starts_at, 'ends_at', e.ends_at)
                            order by e.kind), '[]'::jsonb),
         coalesce(bool_or(e.ends_at is null), false),
         max(e.ends_at)
    into v_active, v_open_ended, v_until
    from public.entitlements e
   where e.user_id = v_uid and private.entitlement_is_active(e);

  return jsonb_build_object(
    'has_access', jsonb_array_length(v_active) > 0,
    'state', private.derive_state(v_email, v_uid),
    'access_until', case when v_open_ended then null else v_until end,
    'active_entitlements', v_active,
    'server_time', now()
  );
end;
$$;

-- Why a function: it is the only path that creates a beta allocation and a
-- beta entitlement, and both must happen with the invitation's acceptance in
-- one transaction. The claimant is identified by their verified account email
-- read from auth.users, never by a parameter, so there is nothing to spoof.
-- Capacity was already reserved when the invitation was issued, so a valid
-- live invitation is always claimable.
create function public.claim_beta_invitation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_invitation public.beta_invitations;
  v_config public.beta_program_config;
  v_allocation public.beta_allocations;
  v_entitlement public.entitlements;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select private.normalize_email(u.email), u.email_confirmed_at
    into v_email, v_confirmed
    from auth.users u where u.id = v_uid;
  if v_email is null or v_confirmed is null then
    raise exception 'email_not_verified' using errcode = '42501';
  end if;

  -- Row lock: a concurrent claim of the same invitation waits here, then
  -- re-checks the WHERE clause and finds it already accepted.
  select * into v_invitation
    from public.beta_invitations
   where email_normalized = v_email
     and accepted_at is null and revoked_at is null and expires_at > now()
   order by created_at desc
   limit 1
   for update;

  if not found then
    if exists (select 1 from public.beta_allocations where email_normalized = v_email or user_id = v_uid) then
      raise exception 'already_activated' using errcode = 'P0001';
    end if;
    raise exception 'no_valid_invitation' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.beta_allocations where email_normalized = v_email or user_id = v_uid) then
    raise exception 'already_activated' using errcode = 'P0001';
  end if;

  select * into v_config from public.beta_program_config where id;

  insert into public.beta_allocations (email_normalized, user_id, invitation_id)
  values (v_email, v_uid, v_invitation.id)
  returning * into v_allocation;

  update public.beta_invitations
     set accepted_at = now(), accepted_by = v_uid
   where id = v_invitation.id;

  insert into public.entitlements (user_id, kind, starts_at, ends_at, source, source_ref)
  values (v_uid, 'beta', now(), now() + make_interval(days => v_config.beta_duration_days),
          'beta_allocation', v_allocation.id::text)
  returning * into v_entitlement;

  perform private.audit(v_uid, 'beta_invitation_claimed', 'beta_allocation', v_allocation.id::text,
    jsonb_build_object('invitation_id', v_invitation.id, 'entitlement_id', v_entitlement.id));

  return jsonb_build_object(
    'entitlement_id', v_entitlement.id,
    'kind', v_entitlement.kind,
    'starts_at', v_entitlement.starts_at,
    'ends_at', v_entitlement.ends_at
  );
end;
$$;

-- ── Admin operations ──────────────────────────────────────────────────────
-- Each one authorizes the caller via private.require_admin() and writes an
-- audit row in the same transaction.

-- Why a function: this is the capacity decision. Locking the single config
-- row serializes every invite, so two admins (or two tabs) racing for the
-- last slot cannot both count "one left". Lifetime used = permanent
-- allocations + live reservations.
create function public.admin_invite(p_email text)
returns public.beta_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin();
  v_email text := private.normalize_email(p_email);
  v_config public.beta_program_config;
  v_used bigint;
  v_invitation public.beta_invitations;
begin
  if not private.is_valid_email(v_email) then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  select * into v_config from public.beta_program_config where id for update;

  if v_config.invitations_paused then
    raise exception 'invitations_paused' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.beta_allocations where email_normalized = v_email) then
    raise exception 'already_activated' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.beta_invitations
             where email_normalized = v_email
               and accepted_at is null and revoked_at is null and expires_at > now()) then
    raise exception 'already_invited' using errcode = 'P0001';
  end if;

  v_used := (select count(*) from public.beta_allocations) + private.live_reservation_count();
  if v_used >= v_config.capacity then
    raise exception 'capacity_exhausted' using errcode = 'P0001',
      detail = format('used %s of %s', v_used, v_config.capacity);
  end if;

  insert into public.beta_invitations (email_normalized, invited_by, expires_at)
  values (v_email, v_actor, now() + make_interval(hours => v_config.reservation_hours))
  returning * into v_invitation;

  perform private.audit(v_actor, 'invitation_created', 'beta_invitation', v_invitation.id::text,
    jsonb_build_object('email', v_email, 'expires_at', v_invitation.expires_at));
  return v_invitation;
end;
$$;

create function public.admin_revoke_invitation(p_invitation_id uuid)
returns public.beta_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin();
  v_invitation public.beta_invitations;
begin
  update public.beta_invitations
     set revoked_at = now(), revoked_by = v_actor
   where id = p_invitation_id and accepted_at is null and revoked_at is null
  returning * into v_invitation;
  if not found then
    raise exception 'invitation_not_revocable' using errcode = 'P0001';
  end if;
  perform private.audit(v_actor, 'invitation_revoked', 'beta_invitation', p_invitation_id::text);
  return v_invitation;
end;
$$;

-- Why one function: pausing and resizing both change the capacity decision,
-- so both take the same lock admin_invite uses. Capacity can never drop below
-- the lifetime allocations already consumed.
create function public.admin_update_beta_config(p_capacity integer default null, p_invitations_paused boolean default null)
returns public.beta_program_config
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin();
  v_before public.beta_program_config;
  v_after public.beta_program_config;
  v_allocated bigint;
begin
  select * into v_before from public.beta_program_config where id for update;
  v_allocated := (select count(*) from public.beta_allocations);
  if p_capacity is not null and p_capacity < v_allocated then
    raise exception 'capacity_below_lifetime_allocations' using errcode = 'P0001',
      detail = format('%s lifetime allocations already consumed', v_allocated);
  end if;

  update public.beta_program_config
     set capacity = coalesce(p_capacity, capacity),
         invitations_paused = coalesce(p_invitations_paused, invitations_paused),
         updated_at = now()
   where id
  returning * into v_after;

  perform private.audit(v_actor, 'beta_config_updated', 'beta_program_config', null,
    jsonb_build_object('before', jsonb_build_object('capacity', v_before.capacity, 'invitations_paused', v_before.invitations_paused),
                       'after', jsonb_build_object('capacity', v_after.capacity, 'invitations_paused', v_after.invitations_paused)));
  return v_after;
end;
$$;

-- Extends from the later of the current end and now, so extending an expired
-- beta gives the full extra days. Open-ended (internal) and Stripe-managed
-- entitlements are not extendable here.
create function public.admin_extend_entitlement(p_entitlement_id uuid, p_days integer)
returns public.entitlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin();
  v_before public.entitlements;
  v_after public.entitlements;
begin
  if p_days is null or p_days not between 1 and 365 then
    raise exception 'invalid_days' using errcode = '22023';
  end if;
  select * into v_before from public.entitlements where id = p_entitlement_id for update;
  if not found then
    raise exception 'entitlement_not_found' using errcode = 'P0001';
  end if;
  if v_before.revoked_at is not null then
    raise exception 'entitlement_revoked' using errcode = 'P0001';
  end if;
  if v_before.ends_at is null or v_before.source = 'stripe' then
    raise exception 'entitlement_not_extendable' using errcode = 'P0001';
  end if;

  update public.entitlements
     set ends_at = greatest(ends_at, now()) + make_interval(days => p_days),
         updated_at = now()
   where id = p_entitlement_id
  returning * into v_after;

  perform private.audit(v_actor, 'entitlement_extended', 'entitlement', p_entitlement_id::text,
    jsonb_build_object('days', p_days, 'ends_at_before', v_before.ends_at, 'ends_at_after', v_after.ends_at));
  return v_after;
end;
$$;

create function public.admin_revoke_entitlement(p_entitlement_id uuid, p_reason text default null)
returns public.entitlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin();
  v_after public.entitlements;
begin
  update public.entitlements
     set revoked_at = now(), revoked_by = v_actor, revoke_reason = left(p_reason, 500), updated_at = now()
   where id = p_entitlement_id and revoked_at is null
  returning * into v_after;
  if not found then
    raise exception 'entitlement_not_revocable' using errcode = 'P0001';
  end if;
  perform private.audit(v_actor, 'entitlement_revoked', 'entitlement', p_entitlement_id::text,
    jsonb_build_object('reason', left(p_reason, 500)));
  return v_after;
end;
$$;

-- Open-ended founder / trusted access. The partial unique index allows one
-- unrevoked internal entitlement per user.
create function public.admin_grant_internal(p_user_id uuid)
returns public.entitlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin();
  v_after public.entitlements;
begin
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  begin
    insert into public.entitlements (user_id, kind, ends_at, source, source_ref)
    values (p_user_id, 'internal', null, 'admin', gen_random_uuid()::text)
    returning * into v_after;
  exception when unique_violation then
    raise exception 'already_internal' using errcode = 'P0001';
  end;
  perform private.audit(v_actor, 'internal_granted', 'entitlement', v_after.id::text,
    jsonb_build_object('user_id', p_user_id));
  return v_after;
end;
$$;

-- Why a function: account emails live in auth.users, which is not readable by
-- authenticated. Returns one row per known email with its derived state.
create function public.admin_list_people(p_search text default null)
returns table (
  email text,
  user_id uuid,
  state text,
  waitlisted_at timestamptz,
  source text,
  latest_invitation_id uuid,
  invitation_expires_at timestamptz,
  allocated_at timestamptz,
  beta_entitlement_id uuid,
  beta_ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(private.normalize_email(p_search), '');
begin
  perform private.require_admin();
  return query
  with emails as (
    select w.email_normalized as email from public.waitlist_entries w
    union select i.email_normalized from public.beta_invitations i
    union select a.email_normalized from public.beta_allocations a
    union select private.normalize_email(u.email) from auth.users u where u.email is not null
  ),
  people as (
    select e.email,
           coalesce((select u.id from auth.users u where private.normalize_email(u.email) = e.email limit 1),
                    (select a.user_id from public.beta_allocations a where a.email_normalized = e.email)) as user_id
      from emails e
     where v_search is null or position(v_search in e.email) > 0 or e.email in (
       select private.normalize_email(u.email) from auth.users u where u.id::text = v_search)
  )
  select p.email,
         p.user_id,
         private.derive_state(p.email, p.user_id),
         w.created_at,
         w.source,
         li.id,
         li.expires_at,
         a.allocated_at,
         be.id,
         be.ends_at
    from people p
    left join public.waitlist_entries w on w.email_normalized = p.email
    left join public.beta_allocations a on a.email_normalized = p.email
    left join public.entitlements be on be.source = 'beta_allocation' and be.source_ref = a.id::text
    left join lateral (
      select i.id, i.expires_at from public.beta_invitations i
       where i.email_normalized = p.email order by i.created_at desc limit 1
    ) li on true
   order by coalesce(a.allocated_at, li.expires_at, w.created_at) desc nulls last;
end;
$$;

-- Capacity numbers for the admin console. SECURITY INVOKER: the counts come
-- from tables only admins can read, so a non-admin gets zero rows.
create view public.beta_capacity
with (security_invoker = true)
as
select c.capacity,
       c.max_lifetime_capacity,
       c.invitations_paused,
       c.reservation_hours,
       c.beta_duration_days,
       (select count(*) from public.beta_allocations) as lifetime_allocated,
       (select count(*) from public.beta_invitations
         where accepted_at is null and revoked_at is null and expires_at > now()) as reserved,
       greatest(c.capacity
                - (select count(*) from public.beta_allocations)
                - (select count(*) from public.beta_invitations
                    where accepted_at is null and revoked_at is null and expires_at > now()), 0) as remaining
  from public.beta_program_config c;
revoke all on public.beta_capacity from anon, authenticated;
grant select on public.beta_capacity to authenticated;

-- ── Auth hook: invite-only account creation ──────────────────────────────
-- Runs inside Supabase Auth before any account is created (email code
-- sign-in included). Joining the waitlist therefore never creates an account.
create function private.before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := private.normalize_email(event -> 'user' ->> 'email');
begin
  if v_email is not null and (
       exists (select 1 from public.beta_invitations
               where email_normalized = v_email
                 and accepted_at is null and revoked_at is null and expires_at > now())
    or exists (select 1 from public.signup_allowlist where email_normalized = v_email)
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Eudaimonai is invite-only right now. Request access on the website.'));
end;
$$;

-- ── Function privileges ──────────────────────────────────────────────────
-- Functions are executable by PUBLIC by default and Supabase additionally
-- grants anon/authenticated. Reset, then grant exactly what is intended.

revoke all on function
  public.join_waitlist(text, text, text),
  public.get_my_access(),
  public.claim_beta_invitation(),
  public.admin_invite(text),
  public.admin_revoke_invitation(uuid),
  public.admin_update_beta_config(integer, boolean),
  public.admin_extend_entitlement(uuid, integer),
  public.admin_revoke_entitlement(uuid, text),
  public.admin_grant_internal(uuid),
  public.admin_list_people(text)
  from public, anon, authenticated;

grant execute on function public.join_waitlist(text, text, text) to anon, authenticated;
grant execute on function
  public.get_my_access(),
  public.claim_beta_invitation(),
  public.admin_invite(text),
  public.admin_revoke_invitation(uuid),
  public.admin_update_beta_config(integer, boolean),
  public.admin_extend_entitlement(uuid, integer),
  public.admin_revoke_entitlement(uuid, text),
  public.admin_grant_internal(uuid),
  public.admin_list_people(text)
  to authenticated;

revoke all on function private.before_user_created(jsonb) from public, anon, authenticated;
grant execute on function private.before_user_created(jsonb) to supabase_auth_admin;
-- The hook reads these as supabase_auth_admin inside its SECURITY DEFINER
-- body owned by postgres, so no table grant to supabase_auth_admin is needed.
