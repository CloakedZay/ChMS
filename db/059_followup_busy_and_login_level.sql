-- =====================================================================
-- 059 — Follow-up leaves Busy members alone; shows the login level
--
-- Run in Supabase → SQL Editor, after 058. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- "Busy" means away for a while on purpose (studying, working abroad,
-- caring for family). The automatic status already leaves them alone
-- (db/056) and they don't count in the attendance rate (db/058). Now
-- the follow-up reminder doesn't list them either. They still show on
-- the Follow-up page under "All members".
--
-- Follow-up also showed the Role typed on the member record, which can
-- disagree with the person's login level. Like the Members page, someone
-- with a login now shows their login level (member_activity.member_role).
--
-- followup_due and member_activity are db/052's otherwise.
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
    -- someone with a login: their login level is their role (db/059)
    coalesce((select p.role from profiles p where p.id = m.profile_id), m.role),
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
    -- Busy members are away on purpose (db/059)
    and s.status <> 'busy'
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
-- Verify (run after commit). Expect both true.
--
-- select (prosrc like '%busy%')::text as skips_busy
-- from pg_proc where proname = 'followup_due'
-- union all
-- select (prosrc like '%login level%')::text
-- from pg_proc where proname = 'member_activity';
-- =====================================================================
