begin;
\ir helpers.psql
select no_plan();

-- Anonymous visitor joins.
select tests.login_as_anon();
select lives_ok($$ select public.join_waitlist('Ada@Example.com', 'landing', 'launch_post') $$,
  'anon can join the waitlist');
select lives_ok($$ select public.join_waitlist('  ada@example.COM ', 'landing') $$,
  'duplicate signup (different case/whitespace) succeeds silently');
select throws_ok($$ select public.join_waitlist('not-an-email') $$, '22023', 'invalid_email',
  'invalid email is rejected');
select throws_ok($$ select public.join_waitlist('ok@example.com', 'Bad Source!') $$, '22023', 'invalid_source',
  'free-text source is rejected (no personal data in attribution)');
select throws_ok($$ select * from public.waitlist_entries $$, '42501', null,
  'anon cannot read the waitlist');
select throws_ok($$ insert into public.waitlist_entries (email_normalized) values ('x@example.com') $$, '42501', null,
  'anon cannot insert into the waitlist table directly');
reset role;

select is((select count(*) from public.waitlist_entries where email_normalized = 'ada@example.com'), 1::bigint,
  'duplicate signup produced exactly one row');
select is((select source from public.waitlist_entries where email_normalized = 'ada@example.com'), 'landing',
  'first signup''s attribution is kept');
select is((select count(*) from auth.users where email ilike 'ada@example.com'), 0::bigint,
  'joining the waitlist creates no account');
select is(private.derive_state('ada@example.com', null), 'WAITLIST', 'derived state is WAITLIST');

-- A signed-in non-admin sees nothing operational.
select tests.login_as(tests.create_user('someone@example.com'));
select is((select count(*) from public.waitlist_entries), 0::bigint, 'non-admin reads zero waitlist rows');
select is((select count(*) from public.beta_capacity), 0::bigint, 'non-admin reads no capacity numbers');
reset role;

-- An admin does.
select tests.login_as(tests.create_admin('founder@example.com'));
select is((select count(*) from public.waitlist_entries), 1::bigint, 'admin reads the waitlist');
reset role;

select * from finish();
rollback;
