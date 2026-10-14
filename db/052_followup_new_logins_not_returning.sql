-- =====================================================================
-- 052 — Follow-up: new logins aren't "quiet", "Not returning" rests
--
-- Run in Supabase → SQL Editor, after 051. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- 1. A login that was never used counted as quiet the moment it was made,
--    so creating logins for 20 members put all 20 in "Needs follow-up"
--    the same day. Now a never-used login is quiet only once it is older
--    than the chosen number of days (counted from when it was created).
--    member_activity() also returns login_created_at, so the page can say
--    "login created 6 days ago".
--
-- 2. When the latest follow-up says "Not returning", the member is no
--    longer reminded about — until they show up again: sign in / open
--    FaithSync, or attend an event, after that follow-up. Then the usual
--    rules apply. (The page lists them under "Not returning".)
--
-- member_activity and followup_due are db/046's otherwise.
-- =====================================================================

begin;

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
  last_attended    date,
  login_created_at timestamptz
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
    (select max(e.date) from event_attendance a join events e on e.id = a.event_id where a.member_id = m.id),
    u.created_at
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

drop function if exists public.followup_due(integer, integer);

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
      u.created_at as login_created,
      case when m.profile_id is null then null
           else nullif(greatest(
                  coalesce(u.last_sign_in_at, '-infinity'::timestamptz),
                  coalesce((select max(started_at) from page_visits pv where pv.user_id = m.profile_id), '-infinity'::timestamptz)
                ), '-infinity'::timestamptz) end as last_seen,
      public.missed_event_streak(m.id) as missed,
      (select max(e.date) from event_attendance a join events e on e.id = a.event_id where a.member_id = m.id) as last_attended,
      lf.outcome as last_outcome,
      lf.created_at as last_followup_at
    from members m
    left join auth.users u on u.id = m.profile_id
    left join lateral (
      select outcome, created_at from member_followups
       where member_id = m.id order by created_at desc, id desc limit 1
    ) lf on true
    where m.status is distinct from 'archived'
      and public.can_follow_up_member(m.id, m.church_id)
  )
  select s.id, s.full_name, s.last_seen, s.status, s.missed
  from seen s
  where (
          -- quiet: not seen for away_days; a never-used login counts from when it was made
          (s.profile_id is not null
            and coalesce(s.last_seen, s.login_created, '-infinity'::timestamptz) < now() - make_interval(days => greatest(away_days, 1)))
          or s.status = 'inactive'
          or s.missed >= greatest(missed_count, 1)
        )
    and not exists (
          select 1 from member_followups f
           where f.member_id = s.id
             and f.created_at >= now() - make_interval(days => greatest(away_days, 1))
        )
    -- "Not returning" rests until they show up again after that follow-up
    and not (
          s.last_outcome = 'not_returning'
          and coalesce(s.last_seen, '-infinity'::timestamptz) <= s.last_followup_at
          and coalesce(s.last_attended, '-infinity'::date) <= (s.last_followup_at at time zone 'Asia/Manila')::date
        )
  order by s.last_seen nulls first, s.full_name;
$$;

revoke all on function public.member_activity(), public.followup_due(integer, integer) from anon, public;
grant execute on function public.member_activity(), public.followup_due(integer, integer) to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect true.
--
-- select bool_or(pg_get_function_result(oid) like '%login_created_at%') as updated
--   from pg_proc where pronamespace = 'public'::regnamespace and proname = 'member_activity';
-- =====================================================================
