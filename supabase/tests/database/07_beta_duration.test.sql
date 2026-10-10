begin;
\ir helpers.psql
select no_plan();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon;
insert into ids values
  ('admin',  tests.create_admin('founder@example.com')),
  ('early',  tests.create_user('early@example.com')),
  ('later',  tests.create_user('later@example.com')),
  ('user',   tests.create_user('plain@example.com'));

-- ── The 60-day migration ─────────────────────────────────────────────────
select is((select beta_duration_days from public.beta_program_config), 60, 'the first cohort gets 60 days');
select is((select column_default from information_schema.columns
            where table_schema = 'public' and table_name = 'beta_program_config' and column_name = 'beta_duration_days'),
          '60', 'a fresh database defaults to 60 days');
select ok(exists (select 1 from public.admin_audit_log
                   where action = 'beta_config_updated' and actor is null
                     and details = '{"before": {"beta_duration_days": 30}, "after": {"beta_duration_days": 60}, "via": "migration 20261011120000"}'::jsonb),
  'the move from 30 to 60 days is in the audit log');

-- ── Activation uses the configured duration ──────────────────────────────
select tests.login_as((select id from ids where name = 'admin'));
select public.admin_invite('early@example.com');
select public.admin_invite('later@example.com');
reset role;

select tests.login_as((select id from ids where name = 'early'));
select lives_ok($$ select public.claim_beta_invitation() $$, 'early invitee activates');
select is((public.get_my_access() ->> 'access_until')::timestamptz, now() + interval '60 days', 'early activation runs 60 days');
reset role;

-- ── Only an admin changes it, within 1..365 days ─────────────────────────
select tests.login_as((select id from ids where name = 'user'));
select throws_ok($$ select public.admin_update_beta_config(p_beta_duration_days => 90) $$, '42501', 'not_authorized',
  'a non-admin cannot change the beta duration');
reset role;

select tests.login_as_anon();
select throws_ok($$ select public.admin_update_beta_config(p_beta_duration_days => 90) $$, '42501', null,
  'anon cannot change the beta duration');
reset role;

select tests.login_as((select id from ids where name = 'admin'));
select throws_ok($$ select public.admin_update_beta_config(p_beta_duration_days => 0) $$, '22023', 'invalid_days',
  'zero days is refused');
select throws_ok($$ select public.admin_update_beta_config(p_beta_duration_days => 366) $$, '22023', 'invalid_days',
  'more than a year is refused');
select is((select beta_duration_days from public.admin_update_beta_config(p_beta_duration_days => 45)), 45,
  'admin sets the next phase to 45 days');
select is((select row(capacity, invitations_paused)::text from public.beta_program_config), '(20,f)',
  'changing the duration leaves capacity and pause alone');
select is((select beta_duration_days from public.admin_update_beta_config(p_capacity => 21)), 45,
  'changing capacity leaves the duration alone');
select ok(exists (select 1 from public.admin_audit_log
                   where action = 'beta_config_updated' and actor = (select id from ids where name = 'admin')
                     and details -> 'before' ->> 'beta_duration_days' = '60'
                     and details -> 'after' ->> 'beta_duration_days' = '45'),
  'the admin change is audited with before and after');
reset role;

-- ── Existing entitlements keep their end; new activations get the new value ─
select is((select ends_at - starts_at from public.entitlements where user_id = (select id from ids where name = 'early')),
  interval '60 days', 'an already active beta keeps its 60 days after the change');

select tests.login_as((select id from ids where name = 'later'));
select lives_ok($$ select public.claim_beta_invitation() $$, 'later invitee activates');
select is((public.get_my_access() ->> 'access_until')::timestamptz, now() + interval '45 days', 'later activation runs 45 days');
reset role;

-- ── Waitlist, reservation and capacity semantics are unchanged ───────────
select is((select row(reservation_hours, max_lifetime_capacity)::text from public.beta_program_config), '(72,50)',
  'reservation hours and lifetime maximum untouched');
select tests.login_as((select id from ids where name = 'admin'));
select is((select lifetime_allocated from public.beta_capacity), 2::bigint, 'two lifetime allocations, one per activation');
reset role;

select * from finish();
rollback;
