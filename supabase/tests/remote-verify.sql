-- Read-only health check for a hosted beta project (staging or production).
-- Run:  supabase db query --linked -f supabase/tests/remote-verify.sql -o json
-- Everything runs in a READ ONLY transaction and is rolled back. Every row
-- must have ok = true. It expects the founder bootstrap (one admin with open
-- internal access) and makes no assumption about how many beta users exist.
begin transaction read only;
with tbl(name) as (values ('beta_program_config'),('waitlist_entries'),('beta_invitations'),('beta_allocations'),
                          ('entitlements'),('admin_users'),('signup_allowlist'),('admin_audit_log')),
fns(sig, anon_ok, auth_ok) as (values
  ('public.join_waitlist(text,text,text)', true, true),
  ('public.get_my_access()', false, true),
  ('public.claim_beta_invitation()', false, true),
  ('public.admin_invite(text)', false, true),
  ('public.admin_revoke_invitation(uuid)', false, true),
  ('public.admin_update_beta_config(integer,boolean)', false, true),
  ('public.admin_extend_entitlement(uuid,integer)', false, true),
  ('public.admin_revoke_entitlement(uuid,text)', false, true),
  ('public.admin_grant_internal(uuid)', false, true),
  ('public.admin_list_people(text)', false, true),
  ('private.is_admin()', false, true),
  ('private.before_user_created(jsonb)', false, false),
  ('private.derive_state(text,uuid)', false, false),
  ('private.require_admin()', false, false),
  ('private.client_ip()', false, false),
  ('private.within_rate_limit(text,interval,integer)', false, false),
  ('private.waitlist_ip_bucket()', false, false),
  ('private.email_hash(text)', false, false),
  ('private.erase_beta_records_for_deleted_account()', false, false)),
checks(area, item, ok, detail) as (
  select 'RLS enabled', t.name, c.relrowsecurity, c.relrowsecurity::text
    from tbl t join pg_class c on c.relname = t.name and c.relnamespace = 'public'::regnamespace
  union all
  select 'no API write privilege', t.name || ' / ' || r.role,
         not (has_table_privilege(r.role, 'public.' || t.name, 'INSERT') or has_table_privilege(r.role, 'public.' || t.name, 'UPDATE')
              or has_table_privilege(r.role, 'public.' || t.name, 'DELETE') or has_table_privilege(r.role, 'public.' || t.name, 'TRUNCATE')),
         'select=' || has_table_privilege(r.role, 'public.' || t.name, 'SELECT')
    from tbl t cross join (values ('anon'),('authenticated')) r(role)
  union all
  select 'function execute', f.sig,
         has_function_privilege('anon', f.sig, 'EXECUTE') = f.anon_ok
         and has_function_privilege('authenticated', f.sig, 'EXECUTE') = f.auth_ok,
         'anon=' || has_function_privilege('anon', f.sig, 'EXECUTE') || ' authenticated=' || has_function_privilege('authenticated', f.sig, 'EXECUTE')
    from fns f
  union all
  select 'hook callable by Auth', 'supabase_auth_admin', has_function_privilege('supabase_auth_admin', 'private.before_user_created(jsonb)', 'EXECUTE'), ''
  union all
  select 'permanence triggers', n, exists (select 1 from pg_trigger where tgname = n), ''
    from (values ('beta_allocations_permanent'),('beta_allocations_no_truncate'),('admin_audit_log_append_only'),('admin_audit_log_no_truncate')) x(n)
  union all
  select 'erasure trigger', 'auth.users', exists (select 1 from pg_trigger where tgname = 'erase_beta_records_on_account_delete' and tgrelid = 'auth.users'::regclass), ''
  union all
  select 'private tables locked', t, (select relrowsecurity from pg_class where oid = ('private.' || t)::regclass)
         and not has_table_privilege('anon', 'private.' || t, 'SELECT') and not has_table_privilege('authenticated', 'private.' || t, 'SELECT'), ''
    from (values ('rate_limit_salt'), ('rate_limit_hits')) x(t)
  union all
  select 'no plaintext email in allocations', 'beta_allocations',
         not exists (select 1 from information_schema.columns where table_schema='public' and table_name='beta_allocations' and column_name='email_normalized'), ''
  union all
  select 'beta config within limits', 'capacity/max',
         (select capacity <= max_lifetime_capacity and max_lifetime_capacity <= 50 from public.beta_program_config),
         (select capacity || '/' || max_lifetime_capacity || ' paused=' || invitations_paused from public.beta_program_config)
  union all
  select 'founder bootstrap', 'one admin with open internal access',
         (select count(*) from public.admin_users) >= 1
         and exists (select 1 from public.admin_users a join public.entitlements e on e.user_id = a.user_id
                     where e.kind = 'internal' and e.revoked_at is null and e.ends_at is null),
         (select count(*) from public.admin_users)::text || ' admin(s)'
  union all
  select 'capacity never exceeded', 'allocations + live reservations <= capacity',
         (select count(*) from public.beta_allocations)
         + (select count(*) from public.beta_invitations where accepted_at is null and revoked_at is null and expires_at > now())
         <= (select capacity from public.beta_program_config), ''
)
select area, item, ok, detail from checks order by ok, area, item;
rollback;
