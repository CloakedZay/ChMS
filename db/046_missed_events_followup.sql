-- =====================================================================
-- 046 — Follow-up: members who missed their last events
--
-- Run in Supabase → SQL Editor, after 045. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- The Follow-up page flagged members only by FaithSync activity (not
-- signed in for N days) or the Secretary's "inactive". Members without a
-- login couldn't be followed at all. Now attendance counts too: a member is
-- also flagged when they missed their last 3 events in a row.
--
-- Which events count for a member (missed_event_streak):
--   * their branch's approved / done events, up to today
--   * where attendance was actually taken (at least one member ticked), so
--     an event nobody marked doesn't count against everyone
--   * whole-church events (no ministry) and events of ministries they are
--     in — not, say, a Youth night for someone who isn't in Youth
--   * held on or after the day they were added as a member
-- The streak is how many of those, newest first, they missed before the
-- last one they attended (looks back 10 events).
--
-- member_activity() and followup_due() now also return missed_events and
-- last_attended. Same people as before can use them (db/038).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- How many of a member's most recent expected events they missed in a row
-- ---------------------------------------------------------------------
create or replace function public.missed_event_streak(p_member bigint)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select id, church_id, ministry,
           -- members.created_at, if the table has it (it was made in the
           -- Supabase dashboard, not in these files)
           coalesce((to_jsonb(members) ->> 'created_at')::timestamptz, '-infinity')::date as since
    from members where id = p_member
  ),
  expected as (
    select e.id, e.date,
           exists (select 1 from event_attendance a where a.event_id = e.id and a.member_id = m.id) as present
    from m
    join events e on e.church_id = m.church_id
    where e.status in ('approved', 'done')
      and e.date <= public.ph_today()
      and e.date >= m.since
      and exists (select 1 from event_attendance t where t.event_id = e.id)
      and (nullif(btrim(e.ministry), '') is null
           or m.ministry = e.ministry
           or exists (select 1 from ministry_assignments ma join ministries mi on mi.id = ma.ministry_id
                       where ma.member_id = m.id and mi.church_id = e.church_id and mi.name = e.ministry))
    order by e.date desc, e.id desc
    limit 10
  )
  select count(*)::int
  from expected x
  where not x.present
    and not exists (select 1 from expected y where y.present and (y.date, y.id) > (x.date, x.id));
$$;

-- Only used inside the functions below.
revoke all on function public.missed_event_streak(bigint) from anon, public, authenticated;

-- ---------------------------------------------------------------------
-- member_activity — as db/038, plus missed_events and last_attended.
-- The returned columns change, so it's dropped and made again.
-- ---------------------------------------------------------------------
drop function if exists public.member_activity();

create function public.member_activity()
returns table (
  member_id        bigint,
  full_name        text,
  member_role      text,
  member_status    text,
  church_id        uuid,
  has_login        boolean,
  last_seen        timestamptz,
  followup_count   integer,
  last_followup_at timestamptz,
  last_outcome     text,
  last_note        text,
  last_by          text,
  missed_events    integer,
  last_attended    date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.full_name,
    m.role,
    coalesce(m.status, 'active'),
    m.church_id,
    m.profile_id is not null,
    case when m.profile_id is null then null
         else nullif(greatest(
                coalesce(u.last_sign_in_at, '-infinity'::timestamptz),
                coalesce(v.last_visit,      '-infinity'::timestamptz)
              ), '-infinity'::timestamptz) end,
    coalesce(fc.n, 0),
    lf.created_at,
    lf.outcome,
    lf.note,
    coalesce(nullif(trim(bp.full_name), ''), split_part(bp.email, '@', 1)),
    public.missed_event_streak(m.id),
    (select max(e.date) from event_attendance a join events e on e.id = a.event_id where a.member_id = m.id)
  from members m
  left join auth.users u on u.id = m.profile_id
  left join lateral (
    select max(started_at) as last_visit from page_visits where user_id = m.profile_id
  ) v on true
  left join lateral (
    select count(*)::int as n from member_followups where member_id = m.id
  ) fc on true
  left join lateral (
    select created_at, outcome, note, created_by from member_followups
     where member_id = m.id order by created_at desc, id desc limit 1
  ) lf on true
  left join profiles bp on bp.id = lf.created_by
  where m.status is distinct from 'archived'
    and public.can_follow_up_member(m.id, m.church_id)
  order by m.full_name;
$$;

-- ---------------------------------------------------------------------
-- followup_due — as db/038, plus "missed their last missed_count events".
-- ---------------------------------------------------------------------
drop function if exists public.followup_due(integer);

create function public.followup_due(away_days integer default 30, missed_count integer default 3)
returns table (member_id bigint, full_name text, last_seen timestamptz, member_status text, missed_events integer)
language sql
stable
security definer
set search_path = public
as $$
  with seen as (
    select
      m.id,
      m.full_name,
      coalesce(m.status, 'active') as status,
      m.profile_id,
      case when m.profile_id is null then null
           else nullif(greatest(
                  coalesce(u.last_sign_in_at, '-infinity'::timestamptz),
                  coalesce((select max(started_at) from page_visits pv where pv.user_id = m.profile_id), '-infinity'::timestamptz)
                ), '-infinity'::timestamptz) end as last_seen,
      public.missed_event_streak(m.id) as missed
    from members m
    left join auth.users u on u.id = m.profile_id
    where m.status is distinct from 'archived'
      and public.can_follow_up_member(m.id, m.church_id)
  )
  select s.id, s.full_name, s.last_seen, s.status, s.missed
  from seen s
  where (
          (s.profile_id is not null and (s.last_seen is null or s.last_seen < now() - make_interval(days => greatest(away_days, 1))))
          or s.status = 'inactive'
          or s.missed >= greatest(missed_count, 1)
        )
    and not exists (
          select 1 from member_followups f
           where f.member_id = s.id
             and f.created_at >= now() - make_interval(days => greatest(away_days, 1))
        )
  order by s.last_seen nulls first, s.full_name;
$$;

revoke all on function public.member_activity(), public.followup_due(integer, integer) from anon, public;
grant execute on function public.member_activity(), public.followup_due(integer, integer) to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect functions = 3, then the members who
-- missed the most events in a row (empty if nobody missed any).
--
-- select count(*) as functions from pg_proc
--  where pronamespace = 'public'::regnamespace
--    and proname in ('missed_event_streak', 'member_activity', 'followup_due');
-- select full_name, public.missed_event_streak(id) as missed_in_a_row
--   from public.members where status is distinct from 'archived'
--  order by 2 desc, 1 limit 20;
-- =====================================================================
