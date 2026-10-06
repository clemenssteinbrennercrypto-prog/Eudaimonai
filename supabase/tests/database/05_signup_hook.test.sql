begin;
\ir helpers.psql
select no_plan();

create function tests.hook(p_email text) returns jsonb language sql as $$
  select private.before_user_created(jsonb_build_object('user', jsonb_build_object('email', p_email)))
$$;

select tests.create_admin('founder@example.com');
select tests.login_as((select id from auth.users where email = 'founder@example.com'));
select public.admin_invite('invited@example.com');
select public.admin_invite('expired@example.com');
select public.admin_invite('revoked@example.com');
select public.admin_revoke_invitation((select id from public.beta_invitations where email_normalized = 'revoked@example.com'));
reset role;
select tests.expire_invitation((select id from public.beta_invitations where email_normalized = 'expired@example.com'));
select public.join_waitlist('waiting@example.com');
insert into public.signup_allowlist (email_normalized, note) values ('internal@example.com', 'founder test device');

select is(tests.hook('Invited@Example.com '), '{}'::jsonb, 'a live invitation allows account creation');
select is(tests.hook('internal@example.com'), '{}'::jsonb, 'an allowlisted email allows account creation');
select is(tests.hook('stranger@example.com') -> 'error' ->> 'http_code', '403', 'an unknown email is refused');
select is(tests.hook('waiting@example.com') -> 'error' ->> 'http_code', '403', 'a waitlist entry alone does not allow an account');
select is(tests.hook('expired@example.com') -> 'error' ->> 'http_code', '403', 'an expired invitation does not allow an account');
select is(tests.hook('revoked@example.com') -> 'error' ->> 'http_code', '403', 'a revoked invitation does not allow an account');
select is(tests.hook(null) -> 'error' ->> 'http_code', '403', 'an event without email is refused');

-- Only Supabase Auth may call the hook.
select tests.login_as_anon();
select throws_ok($$ select private.before_user_created('{}'::jsonb) $$, '42501', null, 'anon cannot call the hook');
reset role;
select tests.login_as((select id from auth.users where email = 'founder@example.com'));
select throws_ok($$ select private.before_user_created('{}'::jsonb) $$, '42501', null, 'even an admin cannot call the hook');
select throws_ok($$ select * from public.signup_allowlist $$, '42501', null, 'the allowlist is not readable through the API roles');
reset role;

select * from finish();
rollback;
