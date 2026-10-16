-- =====================================================================
-- 072 — Inactive also after 3 missed events in a row
--
-- Run in Supabase → SQL Editor, after 071. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- The nightly check (db/056) made an Active member Inactive ("auto") only
-- after 14 days without being seen. Someone who opens FaithSync every day
-- but skips every service stayed Active; only Follow-up listed them
-- (db/046). Now either reason makes them Inactive:
--
--   Active, and not seen for 14 days            → Inactive (auto)
--   Active, and missed their last 3 events      → Inactive (auto)
--   Inactive (auto), seen in the last 14 days
--     and not 3 missed events in a row          → Active again
--
-- So attending an event brings them back the next night (it counts as
-- being seen and ends the streak). Missed events are counted the same way
-- as on the Follow-up page (missed_event_streak, db/046): only approved
-- or done events of their branch where attendance was taken, held since
-- they were added; cancelled and "No attendance needed" events don't
-- count. Busy members and an Inactive set by hand are left alone, as
-- before. Restoring an archived member (db/057) follows the same rule.
-- =====================================================================

begin;

-- Whether the automatic rule says this member should be Inactive.
create or replace function public.member_auto_inactive(p_member bigint, away_days integer default 14, missed_limit integer default 3)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.member_last_active(p_member) < now() - make_interval(days => away_days)
      or public.missed_event_streak(p_member) >= missed_limit;
$$;

revoke all on function public.member_auto_inactive(bigint, integer, integer) from anon, public, authenticated;

-- The nightly check. The old one-argument version is replaced; the cron
-- job (select public.auto_member_status()) keeps working with the defaults.
drop function if exists public.auto_member_status(integer);

create function public.auto_member_status(away_days integer default 14, missed_limit integer default 3)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer := 0;
  n       integer;
begin
  perform set_config('faithsync.auto_status', 'on', true);

  update members m
     set status = 'inactive', status_auto = true
   where coalesce(m.status, 'active') = 'active'
     and public.member_auto_inactive(m.id, away_days, missed_limit);
  get diagnostics n = row_count;
  changed := changed + n;

  update members m
     set status = 'active', status_auto = false
   where m.status = 'inactive' and m.status_auto
     and not public.member_auto_inactive(m.id, away_days, missed_limit);
  get diagnostics n = row_count;
  changed := changed + n;

  perform set_config('faithsync.auto_status', 'off', true);
  return changed;
end;
$$;

revoke all on function public.auto_member_status(integer, integer) from anon, public, authenticated;

-- Restoring from the archive: the same rule decides (was 14 days only, db/057).
create or replace function public.member_status_by_hand()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('faithsync.auto_status', true), '') = 'on'
     or new.status is not distinct from old.status then
    return new;
  end if;

  -- Restored from the archive → the automatic rule decides.
  if old.status = 'archived' and new.status is distinct from 'archived' then
    if public.member_auto_inactive(new.id) then
      new.status      := 'inactive';
      new.status_auto := true;
    else
      new.status      := 'active';
      new.status_auto := false;
    end if;
    return new;
  end if;

  -- Any other status change by hand is no longer "auto".
  new.status_auto := false;
  return new;
end;
$$;

commit;

-- =====================================================================
-- Verify (run after commit). Expect one row, the job, still '0 17 * * *'.
--
-- select jobname, schedule, command from cron.job where jobname = 'faithsync-auto-member-status';
--
-- Preview — who the next nightly check will change, and why:
--
-- select m.full_name, m.status as now,
--        public.member_last_active(m.id) as last_seen,
--        public.missed_event_streak(m.id) as missed_in_a_row
-- from members m
-- where (coalesce(m.status, 'active') = 'active' and public.member_auto_inactive(m.id))
--    or (m.status = 'inactive' and m.status_auto and not public.member_auto_inactive(m.id))
-- order by m.full_name;
--
-- To run it right away instead of waiting for the night:
-- select public.auto_member_status();
-- =====================================================================
