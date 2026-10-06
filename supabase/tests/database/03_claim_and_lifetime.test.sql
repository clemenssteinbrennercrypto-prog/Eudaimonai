begin;
\ir helpers.psql
select no_plan();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon;
insert into ids values
  ('admin',    tests.create_admin('founder@example.com')),
  ('friend',   tests.create_user('friend@example.com')),
  ('stranger', tests.create_user('stranger@example.com')),
  ('late',     tests.create_user('late@example.com')),
  ('unverified', tests.create_user('unverified@example.com', false));

select tests.login_as((select id from ids where name = 'admin'));
select public.admin_invite('friend@example.com');
select public.admin_invite('late@example.com');
select public.admin_invite('unverified@example.com');
reset role;

-- ── Wrong email ──────────────────────────────────────────────────────────
select tests.login_as((select id from ids where name = 'stranger'));
select throws_ok($$ select public.claim_beta_invitation() $$, 'P0001', 'no_valid_invitation',
  'a user without an invitation for their own email cannot claim');
reset role;

-- The claimant is the verified account email, not the JWT claim: a forged
-- email claim in the token does not move the claim to someone else's invite.
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where name = 'stranger'), 'email', 'friend@example.com', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$ select public.claim_beta_invitation() $$, 'P0001', 'no_valid_invitation',
  'a token email that differs from the account email cannot claim that invitation');
reset role;

-- ── Unverified email ─────────────────────────────────────────────────────
select tests.login_as((select id from ids where name = 'unverified'));
select throws_ok($$ select public.claim_beta_invitation() $$, '42501', 'email_not_verified',
  'an unverified account cannot claim');
reset role;

-- ── Successful claim ─────────────────────────────────────────────────────
select tests.login_as((select id from ids where name = 'friend'));
select is((public.get_my_access() ->> 'state'), 'INVITED', 'before claiming, the invitee is INVITED');
select is((public.get_my_access() ->> 'has_access')::boolean, false, 'INVITED grants no access');
select lives_ok($$ select public.claim_beta_invitation() $$, 'invitee claims the invitation');
select is((public.get_my_access() ->> 'state'), 'BETA', 'after claiming, the user is BETA');
select is((public.get_my_access() ->> 'has_access')::boolean, true, 'BETA grants access');
-- Replay
select throws_ok($$ select public.claim_beta_invitation() $$, 'P0001', 'already_activated',
  'replaying the claim is refused');
reset role;

select is((select count(*) from public.beta_allocations where email_hash = private.email_hash('friend@example.com')), 1::bigint,
  'exactly one lifetime allocation');
select is((select count(*) from public.entitlements where user_id = (select id from ids where name = 'friend')), 1::bigint,
  'exactly one entitlement');
select is((select ends_at - starts_at from public.entitlements where user_id = (select id from ids where name = 'friend')),
  interval '30 days', 'beta entitlement lasts 30 days');
select isnt((select accepted_at from public.beta_invitations where email_normalized = 'friend@example.com'), null,
  'invitation is marked accepted');

select tests.login_as((select id from ids where name = 'admin'));
select is((select row(lifetime_allocated, reserved, remaining)::text from public.beta_capacity), '(1,2,17)',
  'activation moved one slot from reserved to lifetime-allocated');
reset role;

-- ── Expired invitation ───────────────────────────────────────────────────
select tests.expire_invitation(id) from public.beta_invitations where email_normalized = 'late@example.com';
select tests.login_as((select id from ids where name = 'late'));
select throws_ok($$ select public.claim_beta_invitation() $$, 'P0001', 'no_valid_invitation',
  'an expired invitation cannot be claimed');
reset role;

-- ── Revoked invitation ───────────────────────────────────────────────────
select tests.login_as((select id from ids where name = 'admin'));
select public.admin_invite('late@example.com');
select public.admin_revoke_invitation((select id from public.beta_invitations
                                        where email_normalized = 'late@example.com' and revoked_at is null and expires_at > now()));
reset role;
select tests.login_as((select id from ids where name = 'late'));
select throws_ok($$ select public.claim_beta_invitation() $$, 'P0001', 'no_valid_invitation',
  'a revoked invitation cannot be claimed');
reset role;

-- ── Lifetime allocation survives expiry ──────────────────────────────────
select tests.expire_entitlement(id) from public.entitlements where user_id = (select id from ids where name = 'friend');
select tests.login_as((select id from ids where name = 'friend'));
select is((public.get_my_access() ->> 'has_access')::boolean, false, 'expired beta grants no access');
select is((public.get_my_access() ->> 'state'), 'LAPSED', 'expired beta derives LAPSED');
reset role;

select tests.login_as((select id from ids where name = 'admin'));
select is((select lifetime_allocated from public.beta_capacity), 1::bigint,
  'expired beta still consumes its lifetime allocation');
select throws_ok($$ select public.admin_invite('friend@example.com') $$, 'P0001', 'already_activated',
  'an activated (now expired) beta user cannot get a second free allocation');
select throws_ok($$ select public.admin_update_beta_config(p_capacity => 0) $$, 'P0001', 'capacity_below_lifetime_allocations',
  'capacity cannot be set below lifetime allocations already consumed');
reset role;

-- ── Account deletion does not refund the allocation ──────────────────────
delete from auth.users where id = (select id from ids where name = 'friend');
select is((select count(*) from public.beta_allocations where email_hash = private.email_hash('friend@example.com')), 1::bigint,
  'allocation survives account deletion');
select is((select count(*) from public.entitlements where user_id = (select id from ids where name = 'friend')), 0::bigint,
  'entitlements are removed with the account');
insert into ids values ('friend_again', tests.create_user('Friend@Example.com'));
select tests.login_as((select id from ids where name = 'admin'));
select throws_ok($$ select public.admin_invite('friend@example.com') $$, 'P0001', 'already_activated',
  're-created account with the same email is still not re-invitable');
reset role;

-- ── The permanent record is permanent ────────────────────────────────────
select throws_ok($$ delete from public.beta_allocations $$, '42501', null, 'allocations cannot be deleted, even by the owner');
select throws_ok($$ truncate public.beta_allocations cascade $$, '42501', null, 'allocations cannot be truncated');
select throws_ok($$ update public.beta_allocations set allocated_at = now() $$, '42501', null, 'allocations cannot be edited');
select throws_ok($$ delete from public.beta_invitations where accepted_at is not null $$, '23503', null,
  'an accepted invitation cannot be deleted while its allocation exists');

select tests.login_as((select id from ids where name = 'late'));
select throws_ok($$ insert into public.beta_allocations (email_hash, user_id, invitation_id)
                    values (repeat('a', 64), auth.uid(), (select id from public.beta_invitations limit 1)) $$,
  '42501', null, 'a user cannot write an allocation directly');
reset role;

select * from finish();
rollback;
