-- ════════════════════════════════════════════════════════════════════════════
-- Founder digest: during the closed beta, the admins get one short email when
-- new access requests or activations arrived, so nobody has to keep the admin
-- console open.
--
-- Every 15 minutes pg_cron runs private.send_founder_digest(). If something
-- new arrived since the last digest, it posts counts (never a requester's
-- address) and the admin addresses to the Edge Function founder-digest, which
-- only sends mail. The function URL and a shared token live in Supabase Vault
-- per project (see docs/beta-access-backend.md); without them the job does
-- nothing, so a database without that setup never sends anything.
--
-- At most one email per 15 minutes, however many requests arrive.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Up to when the last digest counted. Starts now, so rows that already exist
-- never trigger a digest.
create table private.founder_digest_state (
  id boolean primary key default true check (id),
  covered_until timestamptz not null default now()
);
insert into private.founder_digest_state default values;
revoke all on private.founder_digest_state from public, anon, authenticated;

-- Returns the pg_net request id, or null when nothing was sent.
create function private.send_founder_digest()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.founder_digest_state;
  v_until timestamptz := now();
  v_url text;
  v_token text;
  v_requests bigint;
  v_activations bigint;
  v_sources jsonb;
  v_recipients jsonb;
  v_request_id bigint;
begin
  -- A run still holding the row means another digest is being made.
  select * into v_state from private.founder_digest_state where id for update skip locked;
  if not found then
    return null;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'founder_digest_url';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'founder_digest_token';
  if v_url is null or v_token is null then
    return null;
  end if;

  select coalesce(sum(n), 0), coalesce(jsonb_object_agg(src, n), '{}'::jsonb)
    into v_requests, v_sources
    from (select coalesce(source, 'direct') src, count(*) n
            from public.waitlist_entries
           where created_at > v_state.covered_until and created_at <= v_until
           group by 1) s;
  v_activations := (select count(*) from public.beta_allocations
                     where allocated_at > v_state.covered_until and allocated_at <= v_until);
  if v_requests = 0 and v_activations = 0 then
    return null;
  end if;

  select jsonb_agg(u.email order by u.email) into v_recipients
    from public.admin_users a join auth.users u on u.id = a.user_id
   where u.email is not null;
  if v_recipients is null then
    return null;
  end if;

  select net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'new_requests', v_requests,
      'new_activations', v_activations,
      'sources', v_sources,
      'waiting', (select count(*) from public.waitlist_entries w
                   where private.derive_state(w.email_normalized, null) = 'WAITLIST'),
      'remaining', (select remaining from public.beta_capacity),
      'since', v_state.covered_until,
      'until', v_until,
      'recipients', v_recipients),
    headers := jsonb_build_object('content-type', 'application/json', 'x-digest-token', v_token),
    timeout_milliseconds := 10000)
  into v_request_id;

  update private.founder_digest_state set covered_until = v_until where id;
  return v_request_id;
end;
$$;

revoke all on function private.send_founder_digest() from public, anon, authenticated;

select cron.schedule('founder-request-digest', '*/15 * * * *', 'select private.send_founder_digest()');
