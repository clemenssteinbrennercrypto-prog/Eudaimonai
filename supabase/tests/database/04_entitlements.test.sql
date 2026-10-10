begin;
\ir helpers.psql
select no_plan();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon;
insert into ids values
  ('admin', tests.create_admin('founder@example.com')),
  ('beta',  tests.create_user('beta@example.com')),
  ('other', tests.create_user('other@example.com')),
  ('nobody', tests.create_user('nobody@example.com'));

select tests.login_as((select id from ids where name = 'admin'));
select public.admin_invite('beta@example.com');
select public.admin_invite('other@example.com');
reset role;
select tests.login_as((select id from ids where name = 'beta'));
select public.claim_beta_invitation();
reset role;
select tests.login_as((select id from ids where name = 'other'));
select public.claim_beta_invitation();
reset role;

insert into ids select 'beta_ent', id from public.entitlements where user_id = (select id from ids where name = 'beta');
insert into ids select 'other_ent', id from public.entitlements where user_id = (select id from ids where name = 'other');

-- ── Access shape ─────────────────────────────────────────────────────────
select tests.login_as_anon();
select throws_ok($$ select public.get_my_access() $$, '42501', null, 'anon cannot ask for access');
reset role;

select tests.login_as((select id from ids where name = 'nobody'));
select is(public.get_my_access() - 'server_time',
          '{"has_access": false, "state": "NONE", "access_until": null, "active_entitlements": []}'::jsonb,
          'an account with no entitlement has no access');
reset role;

select tests.login_as((select id from ids where name = 'beta'));
select ok((public.get_my_access() ->> 'server_time') is not null, 'access answer carries server time');
select is((public.get_my_access() ->> 'access_until')::timestamptz, now() + interval '30 days', 'access_until is the beta end');

-- ── Unauthorized mutation by the entitled user ───────────────────────────
select throws_ok($$ update public.entitlements set ends_at = now() + interval '10 years' $$, '42501', null,
  'a user cannot extend their own entitlement');
select throws_ok($$ update public.entitlements set revoked_at = null $$, '42501', null,
  'a user cannot un-revoke an entitlement');
select throws_ok($$ insert into public.entitlements (user_id, kind, ends_at, source, source_ref)
                    values (auth.uid(), 'internal', null, 'admin', 'self-grant') $$, '42501', null,
  'a user cannot grant themselves an entitlement');
select throws_ok($$ delete from public.entitlements $$, '42501', null, 'a user cannot delete entitlements');
select throws_ok($$ select public.admin_extend_entitlement((select id from ids where name = 'beta_ent'), 30) $$,
  '42501', 'not_authorized', 'a user cannot call the admin extend function');
select throws_ok($$ select public.admin_grant_internal(auth.uid()) $$, '42501', 'not_authorized',
  'a user cannot grant themselves internal access');
select throws_ok($$ select public.admin_revoke_entitlement((select id from ids where name = 'other_ent')) $$,
  '42501', 'not_authorized', 'a user cannot revoke someone else''s entitlement');
select is((select count(*) from public.entitlements), 1::bigint, 'a user reads only their own entitlement');
select throws_ok($$ insert into public.admin_users (user_id) values (auth.uid()) $$, '42501', null,
  'a user cannot make themselves admin');
reset role;

select is((select ends_at from public.entitlements where id = (select id from ids where name = 'beta_ent')),
          now() + interval '30 days', 'entitlement unchanged after the attempts');

-- ── Duplicate entitlement creation ───────────────────────────────────────
select throws_ok($$ insert into public.entitlements (user_id, kind, ends_at, source, source_ref)
                    values ((select id from ids where name = 'beta'), 'beta', now() + interval '1 day', 'beta_allocation', gen_random_uuid()::text) $$,
  '23505', null, 'a second beta entitlement for one user is impossible, even for the owner');
select throws_ok($$ insert into public.entitlements (user_id, kind, ends_at, source, source_ref)
                    select (select id from ids where name = 'other'), 'beta', now() + interval '1 day', source, source_ref
                      from public.entitlements where id = (select id from ids where name = 'beta_ent') $$,
  '23505', null, 'one source record (allocation / future Stripe subscription) produces one entitlement');
select throws_ok($$ insert into public.entitlements (user_id, kind, ends_at, source, source_ref)
                    values ((select id from ids where name = 'nobody'), 'paid', null, 'admin', 'manual') $$,
  '23514', null, 'paid access can only come from Stripe');
select throws_ok($$ insert into public.entitlements (user_id, kind, ends_at, source, source_ref)
                    values ((select id from ids where name = 'nobody'), 'beta', null, 'beta_allocation', 'x') $$,
  '23514', null, 'beta access is always time-limited');

-- ── Internal ─────────────────────────────────────────────────────────────
select tests.login_as((select id from ids where name = 'admin'));
select lives_ok($$ select public.admin_grant_internal((select id from ids where name = 'nobody')) $$, 'admin grants internal access');
select throws_ok($$ select public.admin_grant_internal((select id from ids where name = 'nobody')) $$, 'P0001', 'already_internal',
  'a second open internal entitlement is refused');
reset role;
select tests.login_as((select id from ids where name = 'nobody'));
select is(public.get_my_access() ->> 'state', 'INTERNAL', 'internal user derives INTERNAL');
select is(public.get_my_access() -> 'access_until', 'null'::jsonb, 'internal access is open-ended');
reset role;

-- ── Expiry ───────────────────────────────────────────────────────────────
select tests.expire_entitlement((select id from ids where name = 'beta_ent'));
select tests.login_as((select id from ids where name = 'beta'));
select is((public.get_my_access() ->> 'has_access')::boolean, false, 'expired entitlement grants no access');
reset role;

-- Extending an expired beta starts from now, not from the past end date.
select tests.login_as((select id from ids where name = 'admin'));
select throws_ok($$ select public.admin_extend_entitlement((select id from ids where name = 'beta_ent'), 0) $$, '22023', 'invalid_days',
  'extension must be 1..365 days');
select lives_ok($$ select public.admin_extend_entitlement((select id from ids where name = 'beta_ent'), 14) $$, 'admin extends the expired beta');
reset role;
select is((select ends_at from public.entitlements where id = (select id from ids where name = 'beta_ent')),
          now() + interval '14 days', 'extension of an expired beta counts from now');
select tests.login_as((select id from ids where name = 'beta'));
select is((public.get_my_access() ->> 'has_access')::boolean, true, 'extended beta grants access again');
reset role;

-- Extending an active beta adds to its current end.
select tests.login_as((select id from ids where name = 'admin'));
select public.admin_extend_entitlement((select id from ids where name = 'other_ent'), 7);
reset role;
select is((select ends_at from public.entitlements where id = (select id from ids where name = 'other_ent')),
          now() + interval '37 days', 'extension of an active beta adds to its end date');

-- ── Revocation ───────────────────────────────────────────────────────────
select tests.login_as((select id from ids where name = 'admin'));
select lives_ok($$ select public.admin_revoke_entitlement((select id from ids where name = 'beta_ent'), 'support test') $$, 'admin revokes');
select throws_ok($$ select public.admin_revoke_entitlement((select id from ids where name = 'beta_ent')) $$, 'P0001', 'entitlement_not_revocable',
  'revoking twice is refused');
select throws_ok($$ select public.admin_extend_entitlement((select id from ids where name = 'beta_ent'), 7) $$, 'P0001', 'entitlement_revoked',
  'a revoked entitlement cannot be extended back to life');
select throws_ok($$ select public.admin_extend_entitlement((select id from entitlements where kind = 'internal'), 7) $$, 'P0001', 'entitlement_not_extendable',
  'open-ended internal access is not "extended"');
select is((select lifetime_allocated from public.beta_capacity), 2::bigint, 'revocation does not refund the lifetime allocation');
select ok(exists (select 1 from public.admin_audit_log where action = 'entitlement_revoked' and details ->> 'reason' = 'support test'),
  'revocation is audited with its reason');
reset role;
select tests.login_as((select id from ids where name = 'beta'));
select is((public.get_my_access() ->> 'has_access')::boolean, false, 'revoked entitlement grants no access');
select is(public.get_my_access() ->> 'state', 'LAPSED', 'revoked beta derives LAPSED');
reset role;

-- ── Overlap: any valid entitlement grants access ─────────────────────────
insert into public.entitlements (user_id, kind, starts_at, ends_at, source, source_ref)
values ((select id from ids where name = 'beta'), 'paid', now(), now() + interval '1 month', 'stripe', 'sub_test_1');
select tests.login_as((select id from ids where name = 'beta'));
select is(public.get_my_access() ->> 'state', 'PAID', 'a paid entitlement grants access next to a revoked beta');
reset role;

-- An entitlement that starts in the future does not grant access yet.
insert into public.entitlements (user_id, kind, starts_at, ends_at, source, source_ref)
values ((select id from ids where name = 'other'), 'trial', now() + interval '60 days', now() + interval '74 days', 'admin', 'future-trial');
select tests.login_as((select id from ids where name = 'other'));
select is(public.get_my_access() ->> 'state', 'BETA', 'a future trial does not displace current beta state');
reset role;

select * from finish();
rollback;
