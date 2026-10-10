begin;
\ir helpers.psql
select no_plan();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon;
insert into ids values ('admin', tests.create_admin('founder@example.com')),
                       ('user',  tests.create_user('plain@example.com'));

create temp view sent as
select id, url, headers, convert_from(body, 'utf8')::jsonb as body from net.http_request_queue;

-- ── Nobody but the database runs it ──────────────────────────────────────
select tests.login_as_anon();
select throws_ok($$ select private.send_founder_digest() $$, '42501', null, 'anon cannot run the digest');
reset role;
select tests.login_as((select id from ids where name = 'admin'));
select throws_ok($$ select private.send_founder_digest() $$, '42501', null, 'even an admin cannot trigger it through the API');
reset role;

select is((select schedule from cron.job where jobname = 'founder-request-digest'), '*/15 * * * *',
  'the digest runs every 15 minutes');

-- ── Without Vault setup it never sends ───────────────────────────────────
select public.join_waitlist('first@example.com', 'reddit', null);
select is(private.send_founder_digest(), null, 'no URL or token in Vault: nothing is sent');
select is((select count(*) from sent), 0::bigint, 'no request queued');

-- ── With setup: one digest with counts only ──────────────────────────────
select vault.create_secret('http://digest.invalid/functions/v1/founder-digest', 'founder_digest_url');
select vault.create_secret('test-digest-token', 'founder_digest_token');

select public.join_waitlist('second@example.com', 'reddit', null);
select public.join_waitlist('third@example.com', null, null);
select tests.login_as((select id from ids where name = 'admin'));
select public.admin_invite('third@example.com');
reset role;

select isnt(private.send_founder_digest(), null, 'new requests: a digest is queued');
select is((select count(*) from sent), 1::bigint, 'exactly one request');
select is((select url from sent), 'http://digest.invalid/functions/v1/founder-digest', 'posted to the configured function');
select is((select headers ->> 'x-digest-token' from sent), 'test-digest-token', 'carries the shared token');
select is((select body - 'since' - 'until' from sent),
  '{"new_requests": 3, "new_activations": 0, "sources": {"reddit": 2, "direct": 1}, "waiting": 2, "remaining": 19,
    "recipients": ["founder@example.com"]}'::jsonb,
  'counts, sources, waiting (the invited one is not), remaining places and the admin address');
select ok((select body::text not like '%first@%' and body::text not like '%second@%' and body::text not like '%third@%' from sent),
  'no requester address leaves the database');

-- ── Nothing new: no second email ─────────────────────────────────────────
select is(private.send_founder_digest(), null, 'nothing new since the last digest: nothing is sent');
select is((select count(*) from sent), 1::bigint, 'still one request');

select * from finish();
rollback;
