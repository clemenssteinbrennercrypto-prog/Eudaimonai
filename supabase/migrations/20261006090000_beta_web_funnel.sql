-- Step 0b: what the public web funnel needs from the database.
--
-- 1. Abuse protection for the anonymous waitlist (free, no external service).
-- 2. The permanent lifetime record keeps a hash of the email, not the email.
-- 3. Deleting an account erases its email from every beta record.
-- 4. admin_list_people returns what the admin console shows.
--
-- Still true: no focus session, history, camera or activity data belongs here.

-- ── 1. Rate limiting ──────────────────────────────────────────────────────
-- Per-IP: 10 waitlist requests per hour, keyed by an HMAC of the address with
-- a secret salt, so the IP itself is never stored. Global: 300 per hour, the
-- hard bound on how fast anyone can grow the table, whatever IPs they rotate.
-- Hit rows older than a day are deleted on every call.

create table private.rate_limit_salt (
  id boolean primary key default true check (id),
  salt bytea not null default extensions.gen_random_bytes(32)
);
insert into private.rate_limit_salt default values;

create table private.rate_limit_hits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (bucket, window_start)
);

alter table private.rate_limit_salt enable row level security;
alter table private.rate_limit_hits enable row level security;
revoke all on private.rate_limit_salt, private.rate_limit_hits from public, anon, authenticated;

-- The caller's address as the API gateway reports it. cf-connecting-ip is set
-- by Cloudflare in front of Supabase; x-forwarded-for is the fallback. Either
-- can be absent (local tests): those callers share one "unknown" bucket.
create function private.client_ip()
returns text
language sql
stable
set search_path = ''
as $$
  with h as (select nullif(current_setting('request.headers', true), '')::jsonb as headers)
  select nullif(btrim(coalesce(headers ->> 'cf-connecting-ip',
                               split_part(headers ->> 'x-forwarded-for', ',', 1))), '')
    from h
$$;

-- Counts one hit and answers whether the bucket is still within its limit.
-- A caller that then raises rolls the hit back, so a rejected request never
-- pushes the counter further; the counter rests at the limit until the
-- window rolls over.
create function private.within_rate_limit(p_bucket text, p_window interval, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := date_bin(p_window, now(), timestamptz '2000-01-01 00:00:00+00');
  v_hits integer;
begin
  insert into private.rate_limit_hits (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = private.rate_limit_hits.hits + 1
  returning hits into v_hits;
  delete from private.rate_limit_hits where window_start < now() - interval '1 day';
  return v_hits <= p_limit;
end;
$$;

create function private.waitlist_ip_bucket()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'waitlist:ip:' || coalesce(
    encode(extensions.hmac(convert_to(private.client_ip(), 'UTF8'), (select salt from private.rate_limit_salt), 'sha256'), 'hex'),
    'unknown')
$$;

create or replace function public.join_waitlist(p_email text, p_source text default null, p_campaign text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := private.normalize_email(p_email);
begin
  if not private.within_rate_limit(private.waitlist_ip_bucket(), interval '1 hour', 10)
     or not private.within_rate_limit('waitlist:global', interval '1 hour', 300) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
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

-- ── 2. Pseudonymised lifetime record ──────────────────────────────────────
-- The lifetime rule only ever asks "has this address already had a free
-- slot?", which an equality check on a hash answers. Unsalted on purpose so
-- the same address always maps to the same value. It is pseudonymised, not
-- anonymous: someone who already knows an address can test it.

create function private.email_hash(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(private.normalize_email(p_email), 'UTF8'), 'sha256'), 'hex')
$$;

alter table public.beta_allocations add column email_hash text;
alter table public.beta_allocations disable trigger beta_allocations_permanent;
update public.beta_allocations set email_hash = private.email_hash(email_normalized);
alter table public.beta_allocations enable trigger beta_allocations_permanent;
alter table public.beta_allocations
  alter column email_hash set not null,
  add constraint beta_allocations_email_hash_key unique (email_hash),
  add constraint beta_allocations_email_hash_is_sha256 check (email_hash ~ '^[0-9a-f]{64}$');
alter table public.beta_allocations drop column email_normalized;

-- ── 3. Erasure when an account is deleted ────────────────────────────────
-- An accepted invitation must stay (the allocation references it), so its
-- email is cleared instead; unaccepted invitations and the waitlist entry are
-- deleted. Entitlements and admin membership already cascade. What remains of
-- the person is the allocation's hash, account id and date.

-- The original format check treats NULL as invalid (is_valid_email(NULL) is
-- false), so it is replaced by one that validates only a present email.
alter table public.beta_invitations
  alter column email_normalized drop not null,
  drop constraint beta_invitations_email_normalized_check,
  add constraint beta_invitations_email_format check (
    email_normalized is null
    or (email_normalized = private.normalize_email(email_normalized) and private.is_valid_email(email_normalized))),
  add constraint beta_invitations_email_kept_until_erased check (email_normalized is not null or accepted_at is not null);

create function private.erase_beta_records_for_deleted_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := private.normalize_email(old.email);
begin
  delete from public.waitlist_entries where email_normalized = v_email;
  delete from public.beta_invitations where email_normalized = v_email and accepted_at is null;
  update public.beta_invitations
     set email_normalized = null
   where accepted_at is not null and (accepted_by = old.id or email_normalized = v_email);
  return old;
end;
$$;

create trigger erase_beta_records_on_account_delete
  after delete on auth.users
  for each row execute function private.erase_beta_records_for_deleted_account();

-- ── Functions that used the plaintext allocation email ───────────────────

create or replace function private.derive_state(p_email_normalized text, p_user_id uuid)
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
      or exists (select 1 from public.beta_allocations a where a.email_hash = private.email_hash(p_email_normalized))
      then 'LAPSED'
    when exists (select 1 from public.waitlist_entries w where w.email_normalized = p_email_normalized) then 'WAITLIST'
    else 'NONE'
  end
$$;

create or replace function public.claim_beta_invitation()
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

  -- The current, confirmed account email. A pending email change is not in
  -- this column until the new address is confirmed.
  select private.normalize_email(u.email), u.email_confirmed_at
    into v_email, v_confirmed
    from auth.users u where u.id = v_uid;
  if v_email is null or v_confirmed is null then
    raise exception 'email_not_verified' using errcode = '42501';
  end if;

  select * into v_invitation
    from public.beta_invitations
   where email_normalized = v_email
     and accepted_at is null and revoked_at is null and expires_at > now()
   order by created_at desc
   limit 1
   for update;

  if not found then
    if exists (select 1 from public.beta_allocations
               where email_hash = private.email_hash(v_email) or user_id = v_uid) then
      raise exception 'already_activated' using errcode = 'P0001';
    end if;
    raise exception 'no_valid_invitation' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.beta_allocations
             where email_hash = private.email_hash(v_email) or user_id = v_uid) then
    raise exception 'already_activated' using errcode = 'P0001';
  end if;

  select * into v_config from public.beta_program_config where id;

  insert into public.beta_allocations (email_hash, user_id, invitation_id)
  values (private.email_hash(v_email), v_uid, v_invitation.id)
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

-- Same capacity logic as before. Changes: the lifetime check uses the hash,
-- and the audit row no longer copies the email (the audit log is
-- append-only, so an email written there could never be erased).
create or replace function public.admin_invite(p_email text)
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
  if exists (select 1 from public.beta_allocations where email_hash = private.email_hash(v_email)) then
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
    jsonb_build_object('expires_at', v_invitation.expires_at));
  return v_invitation;
end;
$$;

-- ── 4. Admin list with invitation status ─────────────────────────────────

drop function public.admin_list_people(text);

create function public.admin_list_people(p_search text default null)
returns table (
  email text,
  user_id uuid,
  state text,
  waitlisted_at timestamptz,
  source text,
  campaign text,
  latest_invitation_id uuid,
  invitation_status text,
  invitation_expires_at timestamptz,
  allocated_at timestamptz,
  beta_entitlement_id uuid,
  beta_ends_at timestamptz,
  beta_revoked_at timestamptz
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
    union select i.email_normalized from public.beta_invitations i where i.email_normalized is not null
    union select private.normalize_email(u.email) from auth.users u where u.email is not null
  ),
  people as (
    select e.email,
           (select u.id from auth.users u where private.normalize_email(u.email) = e.email limit 1) as user_id
      from emails e
     where v_search is null or position(v_search in e.email) > 0 or e.email in (
       select private.normalize_email(u.email) from auth.users u where u.id::text = v_search)
  )
  select p.email,
         p.user_id,
         private.derive_state(p.email, p.user_id),
         w.created_at,
         w.source,
         w.campaign,
         li.id,
         case
           when li.id is null then null
           when li.accepted_at is not null then 'accepted'
           when li.revoked_at is not null then 'revoked'
           when li.expires_at <= now() then 'expired'
           else 'live'
         end,
         li.expires_at,
         a.allocated_at,
         be.id,
         be.ends_at,
         be.revoked_at
    from people p
    left join public.waitlist_entries w on w.email_normalized = p.email
    left join public.beta_allocations a on a.email_hash = private.email_hash(p.email)
    left join public.entitlements be on be.source = 'beta_allocation' and be.source_ref = a.id::text
    left join lateral (
      select i.id, i.expires_at, i.accepted_at, i.revoked_at from public.beta_invitations i
       where i.email_normalized = p.email order by i.created_at desc limit 1
    ) li on true
   order by coalesce(a.allocated_at, li.expires_at, w.created_at) desc nulls last;
end;
$$;

-- ── Privileges for everything created above ──────────────────────────────

revoke all on function
  private.client_ip(),
  private.within_rate_limit(text, interval, integer),
  private.waitlist_ip_bucket(),
  private.email_hash(text),
  private.erase_beta_records_for_deleted_account()
  from public, anon, authenticated;

revoke all on function public.admin_list_people(text) from public, anon, authenticated;
grant execute on function public.admin_list_people(text) to authenticated;
-- join_waitlist, claim_beta_invitation and admin_invite were replaced in
-- place (CREATE OR REPLACE keeps their existing grants).
