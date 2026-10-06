begin;
\ir helpers.psql
select no_plan();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon;
insert into ids values ('admin', tests.create_admin('founder@example.com')),
                       ('user',  tests.create_user('plain@example.com'));

-- Defaults match the release document.
select is((select row(capacity, max_lifetime_capacity, reservation_hours, beta_duration_days, invitations_paused)::text
             from public.beta_program_config),
          '(20,50,72,30,f)', 'defaults: capacity 20, max 50, 72 h reservation, 30 days, not paused');

-- ── Authorization ────────────────────────────────────────────────────────
select tests.login_as_anon();
select throws_ok($$ select public.admin_invite('a@example.com') $$, '42501', null, 'anon cannot call admin_invite');
reset role;

select tests.login_as((select id from ids where name = 'user'));
select throws_ok($$ select public.admin_invite('a@example.com') $$, '42501', 'not_authorized', 'non-admin cannot invite');
select throws_ok($$ select public.admin_update_beta_config(50, false) $$, '42501', 'not_authorized', 'non-admin cannot change capacity');
select throws_ok($$ select public.admin_list_people() $$, '42501', 'not_authorized', 'non-admin cannot list people');
select throws_ok($$ insert into public.beta_invitations (email_normalized, expires_at) values ('a@example.com', now() + interval '1 day') $$,
  '42501', null, 'non-admin cannot insert an invitation directly');
select throws_ok($$ update public.beta_program_config set capacity = 50 $$, '42501', null,
  'non-admin cannot update beta config directly');
reset role;

-- ── Invite, duplicate, revoke ────────────────────────────────────────────
select tests.login_as((select id from ids where name = 'admin'));
select lives_ok($$ select public.admin_invite('Friend.One@Example.com') $$, 'admin invites a friend');
select throws_ok($$ select public.admin_invite('friend.one@example.com') $$, 'P0001', 'already_invited',
  'duplicate invitation for a live invite is refused');
select throws_ok($$ select public.admin_invite('nope') $$, '22023', 'invalid_email', 'invalid email refused');
select is((select reserved from public.beta_capacity), 1::bigint, 'one slot reserved');
select is((select remaining from public.beta_capacity), 19::bigint, '19 slots remain');
select is((select email from public.admin_list_people('friend.one')), 'friend.one@example.com', 'search finds the invitee');
select is((select state from public.admin_list_people('friend.one')), 'INVITED', 'derived state is INVITED');
reset role;

select is((select expires_at - created_at from public.beta_invitations where email_normalized = 'friend.one@example.com'),
          interval '72 hours', 'invitation reserves its slot for 72 hours');

select tests.login_as((select id from ids where name = 'admin'));
select lives_ok($$ select public.admin_revoke_invitation((select id from public.beta_invitations where email_normalized = 'friend.one@example.com')) $$,
  'admin revokes an unused invitation');
select is((select reserved from public.beta_capacity), 0::bigint, 'revoked invitation releases its reservation');
select throws_ok($$ select public.admin_revoke_invitation((select id from public.beta_invitations where email_normalized = 'friend.one@example.com')) $$,
  'P0001', 'invitation_not_revocable', 'an already revoked invitation cannot be revoked again');
select lives_ok($$ select public.admin_invite('friend.one@example.com') $$, 'a revoked email can be invited again');
reset role;

-- ── Expired reservation frees capacity ───────────────────────────────────
select tests.expire_invitation(id) from public.beta_invitations
 where email_normalized = 'friend.one@example.com' and revoked_at is null;

select tests.login_as((select id from ids where name = 'admin'));
select is((select reserved from public.beta_capacity), 0::bigint, 'expired invitation no longer reserves a slot');
select is((select state from public.admin_list_people('friend.one')), 'NONE', 'expired invite without waitlist entry derives NONE');
select lives_ok($$ select public.admin_invite('friend.one@example.com') $$, 'an email whose invite expired can be invited again');
reset role;

-- ── Pause ────────────────────────────────────────────────────────────────
select tests.login_as((select id from ids where name = 'admin'));
select lives_ok($$ select public.admin_update_beta_config(p_invitations_paused => true) $$, 'admin pauses invitations');
select throws_ok($$ select public.admin_invite('paused@example.com') $$, 'P0001', 'invitations_paused',
  'no invitation while paused');
select lives_ok($$ select public.admin_update_beta_config(p_invitations_paused => false) $$, 'admin resumes invitations');
select lives_ok($$ select public.admin_invite('resumed@example.com') $$, 'invitations work again after resume');
reset role;

-- ── Capacity exhaustion ──────────────────────────────────────────────────
select tests.login_as((select id from ids where name = 'admin'));
-- Two live reservations exist (friend.one, resumed). Shrink the cap to 3.
select lives_ok($$ select public.admin_update_beta_config(p_capacity => 3) $$, 'admin lowers capacity to 3');
select lives_ok($$ select public.admin_invite('third@example.com') $$, 'third reservation fits');
select throws_ok($$ select public.admin_invite('fourth@example.com') $$, 'P0001', 'capacity_exhausted',
  'fourth invitation refused at capacity');
select is((select remaining from public.beta_capacity), 0::bigint, 'remaining is 0');
select throws_ok($$ select public.admin_update_beta_config(p_capacity => 51) $$, '23514', null,
  'capacity cannot exceed the 50 lifetime maximum');
reset role;
select throws_ok($$ update public.beta_program_config set max_lifetime_capacity = 60 $$, '23514', null,
  'even the owner cannot raise the lifetime maximum past 50 without a migration');

-- ── Audit trail ──────────────────────────────────────────────────────────
select ok((select count(*) from public.admin_audit_log where action = 'invitation_created') >= 5,
  'every invitation is audited');
select ok(exists (select 1 from public.admin_audit_log where action = 'beta_config_updated'
                  and details -> 'after' ->> 'capacity' = '3'), 'config change audited with before/after');
select throws_ok($$ delete from public.admin_audit_log $$, '42501', null, 'audit log rows cannot be deleted, even by the owner');
select throws_ok($$ update public.admin_audit_log set action = 'x' $$, '42501', null, 'audit log rows cannot be edited');
select tests.login_as((select id from ids where name = 'user'));
select is((select count(*) from public.admin_audit_log), 0::bigint, 'non-admin reads no audit rows');
reset role;

select * from finish();
rollback;
