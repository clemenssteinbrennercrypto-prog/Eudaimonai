begin;
\ir helpers.psql
select no_plan();

create function tests.from_ip(p_ip text) returns void language sql as $$
  select set_config('request.headers', json_build_object('x-forwarded-for', p_ip || ', 10.0.0.1')::text, true)
$$;
grant execute on function tests.from_ip(text) to anon, authenticated;

-- ── Per-IP rate limit ────────────────────────────────────────────────────
select tests.login_as_anon();
select tests.from_ip('203.0.113.7');
select lives_ok(format($$ select public.join_waitlist('ip-a-%s@example.com') $$, n), format('request %s from one IP is accepted', n))
  from generate_series(1, 10) n;
select throws_ok($$ select public.join_waitlist('ip-a-11@example.com') $$, 'P0001', 'rate_limited',
  'the 11th request in an hour from the same IP is refused');
select throws_ok($$ select public.join_waitlist('ip-a-12@example.com') $$, 'P0001', 'rate_limited',
  'and stays refused');
select tests.from_ip('198.51.100.9');
select lives_ok($$ select public.join_waitlist('ip-b@example.com') $$, 'another IP is unaffected');
-- cf-connecting-ip (set by Cloudflare) wins over a client-supplied x-forwarded-for.
select set_config('request.headers', json_build_object('cf-connecting-ip', '203.0.113.7', 'x-forwarded-for', '192.0.2.200')::text, true);
select throws_ok($$ select public.join_waitlist('spoof@example.com') $$, 'P0001', 'rate_limited',
  'a forged x-forwarded-for does not escape the limit when cf-connecting-ip is present');
reset role;

select is((select count(*) from public.waitlist_entries where email_normalized like 'ip-a-%'), 10::bigint,
  'refused requests wrote nothing');
select is((select count(*) from private.rate_limit_hits where bucket like '%203.0.113.7%'), 0::bigint,
  'the IP address itself is never stored');
select ok((select bool_and(bucket ~ '^waitlist:(ip:[0-9a-f]{64}|ip:unknown|global)$') from private.rate_limit_hits),
  'buckets hold only an HMAC of the IP');

-- ── Global cap ───────────────────────────────────────────────────────────
-- 289 more distinct IPs bring the global count to exactly 300.
select tests.login_as_anon();
do $$
begin
  for n in 1..289 loop
    perform tests.from_ip('10.1.' || (n / 250) || '.' || (n % 250));
    perform public.join_waitlist(format('global-%s@example.com', n));
  end loop;
end $$;
select tests.from_ip('192.0.2.77');
select throws_ok($$ select public.join_waitlist('one-too-many@example.com') $$, 'P0001', 'rate_limited',
  'request 301 in an hour is refused even from a fresh IP');
reset role;
select is((select count(*) from public.waitlist_entries), 300::bigint, 'exactly 300 entries were accepted');

-- ── Lifetime record holds a hash, not the email ──────────────────────────
select is((select count(*) from information_schema.columns
            where table_schema = 'public' and table_name = 'beta_allocations' and column_name like '%email%' and column_name <> 'email_hash'),
          0::bigint, 'beta_allocations has no plaintext email column');

-- Start the next section with fresh limits.
delete from public.waitlist_entries;
delete from private.rate_limit_hits;
insert into public.admin_users (user_id) values (tests.create_user('founder@example.com'));
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon;
insert into ids values ('admin', (select user_id from public.admin_users limit 1)),
                       ('friend', tests.create_user('friend@example.com'));
select public.join_waitlist('friend@example.com', 'landing', 'launch');
select public.join_waitlist('pending@example.com');

select tests.login_as((select id from ids where name = 'admin'));
select public.admin_invite('friend@example.com');
select public.admin_invite('pending@example.com');
select public.admin_invite('expired@example.com');
select public.admin_invite('revoked@example.com');
select public.admin_revoke_invitation((select id from public.beta_invitations where email_normalized = 'revoked@example.com'));
reset role;
select tests.expire_invitation((select id from public.beta_invitations where email_normalized = 'expired@example.com'));
select tests.login_as((select id from ids where name = 'friend'));
select public.claim_beta_invitation();
reset role;

select is((select email_hash from public.beta_allocations), private.email_hash('Friend@Example.com '),
  'the allocation stores the hash of the normalized email');
select ok((select email_hash from public.beta_allocations) ~ '^[0-9a-f]{64}$', 'hash is a sha256 hex string');
select ok(not exists (select 1 from public.admin_audit_log where details::text like '%@%'),
  'no audit row contains an email address');

-- ── Admin list shows invitation status ───────────────────────────────────
select tests.login_as((select id from ids where name = 'admin'));
select is((select invitation_status from public.admin_list_people('friend@')), 'accepted', 'accepted invitation status');
select is((select invitation_status from public.admin_list_people('pending@')), 'live', 'live invitation status');
select is((select invitation_status from public.admin_list_people('expired@')), 'expired', 'expired invitation status');
select is((select invitation_status from public.admin_list_people('revoked@')), 'revoked', 'revoked invitation status');
select is((select row(state, source, campaign)::text from public.admin_list_people('friend@')), '(BETA,landing,launch)',
  'activated person shows state and attribution');
select isnt((select allocated_at from public.admin_list_people('friend@')), null, 'activation date is shown');
select isnt((select beta_ends_at from public.admin_list_people('friend@')), null, 'beta end is shown');
reset role;

-- ── Account deletion erases the email from beta records ──────────────────
delete from auth.users where id = (select id from ids where name = 'friend');
select is((select count(*) from public.waitlist_entries where email_normalized = 'friend@example.com'), 0::bigint,
  'the waitlist entry is deleted with the account');
select is((select count(*) from public.beta_invitations where email_normalized = 'friend@example.com'), 0::bigint,
  'no invitation still carries the email');
select is((select count(*) from public.beta_invitations where accepted_at is not null and email_normalized is null), 1::bigint,
  'the accepted invitation survives without its email (the allocation references it)');
select is((select count(*) from public.beta_allocations), 1::bigint, 'the lifetime allocation survives');
select tests.login_as((select id from ids where name = 'admin'));
select throws_ok($$ select public.admin_invite('friend@example.com') $$, 'P0001', 'already_activated',
  'the hash still blocks a second free allocation after erasure');
select is((select count(*) from public.admin_list_people('friend@')), 0::bigint, 'the erased person no longer appears in the list');
select is((select lifetime_allocated from public.beta_capacity), 1::bigint, 'capacity still counts the used slot');
reset role;

-- Deleting an account with only a pending invitation releases the reservation.
insert into ids values ('pending', tests.create_user('pending@example.com'));
delete from auth.users where id = (select id from ids where name = 'pending');
select is((select count(*) from public.beta_invitations where email_normalized = 'pending@example.com'), 0::bigint,
  'an unaccepted invitation is deleted with the account');
select is((select count(*) from public.waitlist_entries where email_normalized = 'pending@example.com'), 0::bigint,
  'and so is the waitlist entry');

-- An unaccepted invitation can never lose its email.
select throws_ok($$ update public.beta_invitations set email_normalized = null where accepted_at is null $$, '23514', null,
  'only accepted invitations may have an erased email');

-- ── The private schema stays private ─────────────────────────────────────
select tests.login_as((select id from ids where name = 'admin'));
select throws_ok($$ select * from private.rate_limit_hits $$, '42501', null, 'even admins cannot read rate-limit rows');
select throws_ok($$ select * from private.rate_limit_salt $$, '42501', null, 'nobody can read the salt through the API roles');
select throws_ok($$ select private.email_hash('x@example.com') $$, '42501', null, 'the hash helper is not callable through the API roles');
reset role;

select * from finish();
rollback;
