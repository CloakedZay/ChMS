-- =====================================================================
-- 075 — Follow-up: members left behind in training
--
-- Run in Supabase → SQL Editor, after 074. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- The Training page's Member Progress tab showed everyone's progress but
-- didn't point out who needs help. Now:
--
-- 1. member_followups.topic — 'attendance' (every entry so far: not
--    coming / not signing in, db/032) or 'training'. A training
--    follow-up is logged in the same history, but only counts for
--    training: it doesn't quiet the attendance reminder, and an
--    attendance follow-up doesn't quiet the training one.
--    Training follow-ups are for the Pastor and Leaders, who see
--    training progress; the Secretary doesn't log or read them.
--
-- 2. training_followup_due(never_days, stalled_days) — members with a
--    login (level Member, not disabled, not archived, not Busy) who have
--    at least one active module meant for them (the general path plus
--    their own ministries' modules, as on Member Progress) and are either
--      never_started  no module opened and no answer, login older than
--                     never_days (14)
--      stalled        started, still has unanswered questions, and no
--                     training activity for stalled_days (30)
--    with no training follow-up in the last stalled_days days.
--    Answers waiting for review don't make anyone "stalled" — that wait
--    is on the reviewer.
--    Scope: Pastor and Admin every branch, Leader their own branch
--    (Admin can see it but can't log follow-ups). Nobody else.
--
-- member_activity, member_followup_history and followup_due are db/059's
-- (and db/032's) otherwise.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Topic
-- ---------------------------------------------------------------------
alter table public.member_followups
  add column if not exists topic text not null default 'attendance';

alter table public.member_followups drop constraint if exists member_followups_topic_check;
alter table public.member_followups add constraint member_followups_topic_check
  check (topic in ('attendance', 'training'));

-- May the signed-in user see / log follow-ups of this topic?
create or replace function public.can_follow_up_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_topic = 'attendance' or public.get_my_role() in ('pastor', 'leader');
$$;

drop policy if exists "followups read"   on public.member_followups;
drop policy if exists "followups insert" on public.member_followups;
create policy "followups read"
  on public.member_followups for select to authenticated
  using (public.can_follow_up_member(member_id, church_id) and public.can_follow_up_topic(topic));
create policy "followups insert"
  on public.member_followups for insert to authenticated
  with check (public.can_follow_up_member(member_id, church_id) and public.can_follow_up_topic(topic));

-- ---------------------------------------------------------------------
-- 2. The Follow-up page: its flags use attendance follow-ups only; the
--    history shows both topics (to those who may see them).
-- ---------------------------------------------------------------------
create or replace function public.member_activity()
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
    select count(*)::int as n from member_followups
     where member_id = m.id and public.can_follow_up_topic(topic)
  ) fc on true
  left join lateral (
    select created_at, outcome, note, created_by from member_followups
     where member_id = m.id and topic = 'attendance'
     order by created_at desc, id desc limit 1
  ) lf on true
  left join profiles bp on bp.id = lf.created_by
  where m.status is distinct from 'archived'
    and public.can_follow_up_member(m.id, m.church_id)
  order by m.full_name;
$$;

drop function if exists public.member_followup_history(bigint);

create function public.member_followup_history(mid bigint)
returns table (id bigint, outcome text, note text, created_at timestamptz, by_name text, topic text)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.outcome, f.note, f.created_at,
         coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1), 'Unknown'),
         f.topic
  from member_followups f
  join members m on m.id = f.member_id
  left join profiles p on p.id = f.created_by
  where f.member_id = mid
    and public.can_follow_up_member(m.id, m.church_id)
    and public.can_follow_up_topic(f.topic)
  order by f.created_at desc, f.id desc;
$$;

create or replace function public.followup_due(away_days integer default 30, missed_count integer default 3)
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
       where member_id = m.id and topic = 'attendance'
       order by created_at desc, id desc limit 1
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
             and f.topic = 'attendance'
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

-- ---------------------------------------------------------------------
-- 3. Who is behind in training
-- ---------------------------------------------------------------------
create or replace function public.training_followup_due(never_days integer default 14, stalled_days integer default 30)
returns table (
  member_id        bigint,
  profile_id       uuid,
  full_name        text,
  church_id        uuid,
  reason           text,          -- 'never_started' | 'stalled'
  last_activity    timestamptz,
  login_created_at timestamptz,
  answered         integer,
  total_questions  integer,
  last_followup_at timestamptz,   -- latest training follow-up, if any
  last_outcome     text,
  last_by          text
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (
    select m.id, m.profile_id, m.full_name, m.church_id, u.created_at as login_created
    from members m
    join profiles p   on p.id = m.profile_id and p.role = 'member' and not p.disabled
    join auth.users u on u.id = m.profile_id
    where m.status is distinct from 'archived'
      and coalesce(m.status, 'active') <> 'busy'
      and (
        public.get_my_role() in ('pastor', 'admin')
        or (public.get_my_role() = 'leader' and m.church_id = public.get_my_church_id())
      )
  ),
  -- Active modules meant for each member: the general path plus their own
  -- (active) ministries' modules.
  assigned as (
    select s.id as member_id, dm.id as module_id
    from scope s
    join discipleship_modules dm on dm.is_active
    where dm.ministry_id is null
       or exists (
            select 1 from ministry_assignments a
            join ministries mi on mi.id = a.ministry_id and mi.is_active
            where a.member_id = s.id and a.ministry_id = dm.ministry_id
          )
  ),
  stats as (
    select
      s.*,
      (select count(*)::int from assigned x where x.member_id = s.id) as n_modules,
      (select count(*)::int
         from assigned x join discipleship_questions q on q.module_id = x.module_id
        where x.member_id = s.id) as total_q,
      (select count(*)::int
         from assigned x
         join discipleship_questions q on q.module_id = x.module_id
         join discipleship_progress dp on dp.question_id = q.id and dp.member_id = s.profile_id
        where x.member_id = s.id) as answered,
      -- greatest() skips nulls; null only when there's no activity at all
      greatest(
        (select max(v.created_at)
           from module_views v
           join assigned x on x.module_id = v.module_id and x.member_id = s.id
          where v.member_id = s.profile_id),
        (select max(greatest(dp.created_at, dp.updated_at))
           from discipleship_progress dp
           join discipleship_questions q on q.id = dp.question_id
           join assigned x on x.module_id = q.module_id and x.member_id = s.id
          where dp.member_id = s.profile_id)
      ) as last_activity,
      lf.created_at as last_followup_at,
      lf.outcome    as last_outcome,
      lf.created_by as last_followup_by
    from scope s
    left join lateral (
      select created_at, outcome, created_by from member_followups f
       where f.member_id = s.id and f.topic = 'training'
       order by created_at desc, id desc limit 1
    ) lf on true
  )
  select
    st.id,
    st.profile_id,
    st.full_name,
    st.church_id,
    case when st.last_activity is null then 'never_started' else 'stalled' end,
    st.last_activity,
    st.login_created,
    st.answered,
    st.total_q,
    st.last_followup_at,
    st.last_outcome,
    coalesce(nullif(trim(bp.full_name), ''), split_part(bp.email, '@', 1))
  from stats st
  left join profiles bp on bp.id = st.last_followup_by
  where st.n_modules > 0
    and (st.last_followup_at is null
         or st.last_followup_at < now() - make_interval(days => greatest(stalled_days, 1)))
    and (
      (st.last_activity is null
        and st.login_created < now() - make_interval(days => greatest(never_days, 1)))
      or (st.last_activity is not null
        and st.last_activity < now() - make_interval(days => greatest(stalled_days, 1))
        and st.answered < st.total_q)
    )
  order by st.last_activity nulls first, st.full_name;
$$;

revoke all on function
  public.can_follow_up_topic(text),
  public.member_activity(),
  public.member_followup_history(bigint),
  public.followup_due(integer, integer),
  public.training_followup_due(integer, integer)
  from anon, public;
grant execute on function
  public.can_follow_up_topic(text),
  public.member_activity(),
  public.member_followup_history(bigint),
  public.followup_due(integer, integer),
  public.training_followup_due(integer, integer)
  to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect: topic_column = 1, every existing
-- follow-up 'attendance', and the function listed.
--
-- select
--   (select count(*) from information_schema.columns
--     where table_name = 'member_followups' and column_name = 'topic') as topic_column,
--   (select count(*) from member_followups where topic <> 'attendance') as not_attendance,
--   (select count(*) from pg_proc where proname = 'training_followup_due') as training_fn;
-- =====================================================================
