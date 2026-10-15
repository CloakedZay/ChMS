-- =====================================================================
-- 056 — Members become Inactive by themselves after 2 weeks away
--
-- Run in Supabase → SQL Editor, after 055. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Every night (1 AM Philippine time) each member's status is checked:
--
--   Active, and not seen for 14 days      → Inactive  (marked "auto")
--   Inactive "auto", and seen again       → Active
--
-- "Seen" = the latest of: signing in or opening FaithSync (the same
-- last-seen as Follow-up), having attendance ticked at an event, or the
-- record / login being created (so new people get their first 2 weeks).
--
-- Left alone: Busy members (away for a while on purpose), archived
-- members, and anyone the Secretary set Inactive by hand — a status the
-- Secretary picks is never undone by the nightly check. Choosing Active
-- again by hand puts the member back under the automatic rule.
--
-- members.status_auto  true while the status was set by the nightly check
-- members.added_at     when the record was added (for the first 2 weeks)
--
-- Needs the pg_cron extension (Supabase: Database → Extensions); this
-- file turns it on. To preview who would change tonight, run the query
-- at the bottom.
-- =====================================================================

begin;

alter table public.members
  add column if not exists status_auto boolean not null default false,
  add column if not exists added_at    timestamptz not null default now();

-- ---------------------------------------------------------------------
-- When someone changes a status by hand, it's no longer "auto".
-- ---------------------------------------------------------------------
create or replace function public.member_status_by_hand()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('faithsync.auto_status', true), '') <> 'on'
     and new.status is distinct from old.status then
    new.status_auto := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_member_status_by_hand on public.members;
create trigger trg_member_status_by_hand
  before update on public.members
  for each row execute function public.member_status_by_hand();

-- Pastor may still only change status (db/006, db/055); status_auto moves
-- with the status, so it's allowed too.
create or replace function public.restrict_pastor_member_edits()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.get_my_role() = 'pastor'
     and (to_jsonb(new) - 'status' - 'archive_disabled_login' - 'status_auto')
         is distinct from (to_jsonb(old) - 'status' - 'archive_disabled_login' - 'status_auto') then
    raise exception 'Pastors can only archive or restore members; ask the Secretary to edit details';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- When each member was last seen (null parts are skipped).
-- ---------------------------------------------------------------------
create or replace function public.member_last_active(p_member bigint)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select nullif(greatest(
           coalesce(u.last_sign_in_at, '-infinity'::timestamptz),
           coalesce((select max(started_at) from page_visits pv where pv.user_id = m.profile_id), '-infinity'::timestamptz),
           coalesce((select max(e.date) from event_attendance a join events e on e.id = a.event_id
                      where a.member_id = m.id)::timestamp at time zone 'Asia/Manila', '-infinity'::timestamptz),
           coalesce(u.created_at, '-infinity'::timestamptz),
           coalesce((to_jsonb(m) ->> 'created_at')::timestamptz, m.added_at)
         ), '-infinity'::timestamptz)
  from members m
  left join auth.users u on u.id = m.profile_id
  where m.id = p_member;
$$;

revoke all on function public.member_last_active(bigint) from anon, public, authenticated;

-- ---------------------------------------------------------------------
-- The nightly check. Returns how many members changed.
-- ---------------------------------------------------------------------
create or replace function public.auto_member_status(away_days integer default 14)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff  timestamptz := now() - make_interval(days => away_days);
  changed integer := 0;
  n       integer;
begin
  perform set_config('faithsync.auto_status', 'on', true);

  update members m
     set status = 'inactive', status_auto = true
   where coalesce(m.status, 'active') = 'active'
     and public.member_last_active(m.id) < cutoff;
  get diagnostics n = row_count;
  changed := changed + n;

  update members m
     set status = 'active', status_auto = false
   where m.status = 'inactive' and m.status_auto
     and public.member_last_active(m.id) >= cutoff;
  get diagnostics n = row_count;
  changed := changed + n;

  perform set_config('faithsync.auto_status', 'off', true);
  return changed;
end;
$$;

revoke all on function public.auto_member_status(integer) from anon, public, authenticated;

-- ---------------------------------------------------------------------
-- Run it every night at 1 AM Philippine time (17:00 UTC).
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'faithsync-auto-member-status';
select cron.schedule('faithsync-auto-member-status', '0 17 * * *', 'select public.auto_member_status()');

commit;

-- =====================================================================
-- Verify (run after commit). Expect one row: the job, '0 17 * * *'.
--
-- select jobname, schedule, command from cron.job where jobname = 'faithsync-auto-member-status';
--
-- Preview — who the next nightly check will change:
--
-- select m.full_name, m.status as now, case when m.status = 'inactive' then 'active' else 'inactive' end as becomes,
--        public.member_last_active(m.id) as last_seen
-- from members m
-- where (coalesce(m.status, 'active') = 'active' and public.member_last_active(m.id) < now() - interval '14 days')
--    or (m.status = 'inactive' and m.status_auto and public.member_last_active(m.id) >= now() - interval '14 days')
-- order by m.full_name;
--
-- To run it right away instead of waiting for the night:
-- select public.auto_member_status();
-- =====================================================================
