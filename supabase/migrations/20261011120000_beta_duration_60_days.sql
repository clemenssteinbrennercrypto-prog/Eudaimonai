-- ════════════════════════════════════════════════════════════════════════════
-- First closed-beta cohort: 60 days of beta access instead of 30.
--
-- The duration stays data, not code: claim_beta_invitation reads
-- beta_program_config.beta_duration_days at activation and stores the end on
-- the entitlement. This migration
--   1. moves the column default to 60 (fresh databases, local and CI),
--   2. moves the existing row to 60 only if it still holds the old default 30,
--      so a value an admin set on purpose is never overwritten by a deploy,
--   3. lets admin_update_beta_config change the duration, audited, so a later
--      phase changes it without a migration.
-- Entitlements already granted keep their stored ends_at. Nothing here
-- touches entitlements, invitations, allocations or the waitlist.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.beta_program_config alter column beta_duration_days set default 60;

-- Recorded like an admin change, with no actor: the deploy made it.
with changed as (
  update public.beta_program_config
     set beta_duration_days = 60, updated_at = now()
   where id and beta_duration_days = 30
  returning 1
)
insert into public.admin_audit_log (actor, action, target_type, target_id, details)
select null, 'beta_config_updated', 'beta_program_config', null,
       jsonb_build_object('before', jsonb_build_object('beta_duration_days', 30),
                          'after', jsonb_build_object('beta_duration_days', 60),
                          'via', 'migration 20261011120000')
  from changed;

-- Same function, one more optional argument. The duration only applies to
-- activations after the change; it never rewrites an existing entitlement
-- (admin_extend_entitlement does that, one person at a time).
drop function public.admin_update_beta_config(integer, boolean);

create function public.admin_update_beta_config(
  p_capacity integer default null,
  p_invitations_paused boolean default null,
  p_beta_duration_days integer default null)
returns public.beta_program_config
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_admin();
  v_before public.beta_program_config;
  v_after public.beta_program_config;
  v_allocated bigint;
begin
  select * into v_before from public.beta_program_config where id for update;
  v_allocated := (select count(*) from public.beta_allocations);
  if p_capacity is not null and p_capacity < v_allocated then
    raise exception 'capacity_below_lifetime_allocations' using errcode = 'P0001',
      detail = format('%s lifetime allocations already consumed', v_allocated);
  end if;
  if p_beta_duration_days is not null and p_beta_duration_days not between 1 and 365 then
    raise exception 'invalid_days' using errcode = '22023';
  end if;

  update public.beta_program_config
     set capacity = coalesce(p_capacity, capacity),
         invitations_paused = coalesce(p_invitations_paused, invitations_paused),
         beta_duration_days = coalesce(p_beta_duration_days, beta_duration_days),
         updated_at = now()
   where id
  returning * into v_after;

  perform private.audit(v_actor, 'beta_config_updated', 'beta_program_config', null,
    jsonb_build_object('before', jsonb_build_object('capacity', v_before.capacity, 'invitations_paused', v_before.invitations_paused,
                                                    'beta_duration_days', v_before.beta_duration_days),
                       'after', jsonb_build_object('capacity', v_after.capacity, 'invitations_paused', v_after.invitations_paused,
                                                   'beta_duration_days', v_after.beta_duration_days)));
  return v_after;
end;
$$;

revoke all on function public.admin_update_beta_config(integer, boolean, integer) from public, anon, authenticated;
grant execute on function public.admin_update_beta_config(integer, boolean, integer) to authenticated;
