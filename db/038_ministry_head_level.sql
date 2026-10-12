-- =====================================================================
-- 038 — New user level: Ministry Head
--
-- Run in Supabase → SQL Editor, after 037. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- A Ministry Head manages ONLY the ministries they head (ministries.
-- leader_id = their login). Unlike a Leader they have no branch-wide
-- powers: no finance, no spending approvals, no other ministries, no
-- general discipleship modules, no member records (phone / email).
--
-- For the ministries they head they can:
--   * add / remove the ministry's members           (ministry_assignments)
--   * create and edit its training modules, questions and handouts, and
--     review its members' answers                   (discipleship_*)
--   * submit events for that ministry (the Pastor approves)   (events)
--   * post announcements to that ministry's members (announcements)
--   * follow up that ministry's members             (member_followups)
-- A Leader who heads a ministry keeps everything they had.
--
-- Announcements also gain an optional ministry: such an announcement is
-- shown only to that ministry's members (plus Pastor, Admin, and the
-- branch's Leaders / Secretary). Pastor and Leaders may use it too.
-- =====================================================================

begin;

set local search_path = public, extensions;

-- ---------------------------------------------------------------------
-- 1. The level itself
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'pastor', 'leader', 'ministry_head', 'finance', 'secretary', 'member'));

-- Is the signed-in user the head of this ministry? (was: Leaders only)
create or replace function public.is_ministry_head(min_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from ministries
    where id = min_id and leader_id = auth.uid()
      and public.get_my_role() in ('leader', 'ministry_head')
  );
$$;

-- Does the signed-in Ministry Head head a ministry this member is in?
create or replace function public.in_my_headed_ministry(mid bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_my_role() = 'ministry_head' and exists (
    select 1 from ministry_assignments a
    join ministries mi on mi.id = a.ministry_id
    where a.member_id = mid and mi.leader_id = auth.uid()
  );
$$;

-- Is this module one of the signed-in Ministry Head's ministries?
create or replace function public.is_my_headed_module(mod_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_my_role() = 'ministry_head' and exists (
    select 1 from discipleship_modules dm
    join ministries mi on mi.id = dm.ministry_id
    where dm.id = mod_id and mi.leader_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Seeing what they manage
-- ---------------------------------------------------------------------
-- Their ministries' member lists (members table stays closed to them;
-- names come from member_directory).
drop policy if exists "read ministry assignments" on public.ministry_assignments;
create policy "read ministry assignments"
  on public.ministry_assignments for select to authenticated
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('leader', 'secretary') and church_id = public.get_my_church_id())
    or public.is_my_member_record(member_id)
    or public.is_ministry_head(ministry_id)
  );

-- The member records (incl. contact details) of people in their own
-- ministries only — to reach them for follow-up and to match progress.
drop policy if exists "ministry head reads their members" on public.members;
create policy "ministry head reads their members"
  on public.members for select to authenticated
  using (public.in_my_headed_ministry(id));

-- Names of the logins in their branch (to show who answered). Same rule as
-- Leaders and the Secretary (db/006).
drop policy if exists "staff read profiles scoped" on public.profiles;
create policy "staff read profiles scoped"
  on public.profiles for select to authenticated
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('leader', 'secretary', 'ministry_head') and church_id = public.get_my_church_id())
  );

-- Answers to their ministries' modules, and who opened those modules.
drop policy if exists "ministry head reads answers" on public.discipleship_progress;
create policy "ministry head reads answers"
  on public.discipleship_progress for select to authenticated
  using (public.is_my_headed_module(module_id));

drop policy if exists "ministry head reads module views" on public.module_views;
create policy "ministry head reads module views"
  on public.module_views for select to authenticated
  using (public.is_my_headed_module(module_id));

-- ---------------------------------------------------------------------
-- 3. Training: modules, questions, handouts (db/025 routes everything
--    through these two functions) and answer review
-- ---------------------------------------------------------------------
create or replace function public.can_edit_module_group(min_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.get_my_role()
           when 'pastor'        then true
           when 'leader'        then min_id is null or public.is_ministry_head(min_id)
           when 'ministry_head' then min_id is not null and public.is_ministry_head(min_id)
           else false
         end;
$$;

-- Reviewer path of the answer guard now includes Ministry Heads.
create or replace function public.guard_discipleship_progress()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.get_my_role() in ('pastor', 'leader', 'ministry_head')
     and new.member_id is distinct from auth.uid() then
    if tg_op = 'UPDATE' then
      new.member_id   := old.member_id;
      new.module_id   := old.module_id;
      new.question_id := old.question_id;
      new.answer      := old.answer;
      new.church_id   := old.church_id;
      if new.status is distinct from old.status then
        new.reviewed_by := auth.uid()::text;
        new.reviewed_at := now();
      else
        new.reviewed_by := old.reviewed_by;
        new.reviewed_at := old.reviewed_at;
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'approved' then
      raise exception 'This answer is already approved and can''t be changed';
    end if;
    new.member_id   := old.member_id;
    new.module_id   := old.module_id;
    new.question_id := old.question_id;
    new.church_id   := coalesce(old.church_id, public.get_my_church_id());
    new.notes       := old.notes;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  else
    new.church_id   := public.get_my_church_id();
    new.notes       := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  new.status     := 'pending';
  new.updated_at := now();
  return new;
end;
$$;

drop policy if exists "ministry head reviews answers" on public.discipleship_progress;
create policy "ministry head reviews answers"
  on public.discipleship_progress for update to authenticated
  using      (member_id is distinct from auth.uid() and public.is_my_headed_module(module_id))
  with check (member_id is distinct from auth.uid() and public.is_my_headed_module(module_id));

-- Search index rows for their modules' handouts (db/035).
create or replace function public.can_write_knowledge(stype text, cid uuid, mod_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when stype = 'document' then
      public.get_my_role() = 'pastor'
      or (public.get_my_role() = 'leader' and cid = public.get_my_church_id())
    when stype = 'handout' then
      public.get_my_role() in ('pastor', 'leader', 'ministry_head') and public.can_edit_module(mod_id)
    else false
  end;
$$;

-- ---------------------------------------------------------------------
-- 4. Events for their ministries (like a Leader: planning / pending only;
--    the Pastor approves). events.ministry holds the ministry's name.
-- ---------------------------------------------------------------------
create or replace function public.heads_ministry_named(min_name text, cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from ministries
    where name = min_name and church_id = cid and leader_id = auth.uid() and is_active
  );
$$;

drop policy if exists "ministry head create events" on public.events;
create policy "ministry head create events"
  on public.events for insert to authenticated
  with check (
    public.get_my_role() = 'ministry_head'
    and church_id = public.get_my_church_id()
    and created_by = auth.uid()
    and status in ('planning', 'pending')
    and public.heads_ministry_named(ministry, church_id)
  );

drop policy if exists "ministry head edit own events" on public.events;
create policy "ministry head edit own events"
  on public.events for update to authenticated
  using (
    public.get_my_role() = 'ministry_head'
    and created_by = auth.uid()
    and status in ('planning', 'pending')
  )
  with check (
    public.get_my_role() = 'ministry_head'
    and church_id = public.get_my_church_id()
    and created_by = auth.uid()
    and status in ('planning', 'pending')
    and public.heads_ministry_named(ministry, church_id)
  );

-- ---------------------------------------------------------------------
-- 5. Announcements: optional ministry audience
-- ---------------------------------------------------------------------
alter table public.announcements
  add column if not exists ministry_id uuid references public.ministries (id) on delete cascade;

drop policy if exists "announcements read"   on public.announcements;
drop policy if exists "announcements insert" on public.announcements;
drop policy if exists "announcements update" on public.announcements;
drop policy if exists "announcements delete" on public.announcements;
drop function if exists public.can_edit_announcement(uuid);

-- Can the signed-in user write an announcement for this branch / ministry?
--   Pastor   any branch, all branches, any ministry
--   Leader   own branch (optionally one of its ministries)
--   Ministry Head  only a ministry they head (in its branch)
create or replace function public.can_edit_announcement(cid uuid, mid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when mid is not null and not exists (select 1 from ministries where id = mid and church_id is not distinct from cid) then false
    when public.get_my_role() = 'pastor' then true
    when public.get_my_role() = 'leader' then cid is not null and cid = public.get_my_church_id()
    when public.get_my_role() = 'ministry_head' then mid is not null and public.is_ministry_head(mid)
    else false
  end;
$$;

-- Is the signed-in person in this ministry?
create or replace function public.am_in_ministry(mid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from ministry_assignments a
    join members m on m.id = a.member_id
    where a.ministry_id = mid and m.profile_id = auth.uid()
  );
$$;

create policy "announcements read"
  on public.announcements for select to authenticated
  using (
    public.get_my_role() is not null
    and (
      public.can_edit_announcement(church_id, ministry_id)
      or (
        (expires_on is null or expires_on >= (now() at time zone 'Asia/Manila')::date)
        and (
          public.get_my_role() in ('admin', 'pastor')
          or (
            (church_id is null or church_id = public.get_my_church_id())
            and (
              ministry_id is null
              or public.get_my_role() in ('leader', 'secretary')
              or public.am_in_ministry(ministry_id)
              or public.is_ministry_head(ministry_id)
            )
          )
        )
      )
    )
  );

create policy "announcements insert"
  on public.announcements for insert to authenticated
  with check (public.can_edit_announcement(church_id, ministry_id) and created_by = auth.uid());

create policy "announcements update"
  on public.announcements for update to authenticated
  using (public.can_edit_announcement(church_id, ministry_id))
  with check (public.can_edit_announcement(church_id, ministry_id));

create policy "announcements delete"
  on public.announcements for delete to authenticated
  using (public.can_edit_announcement(church_id, ministry_id));

-- ---------------------------------------------------------------------
-- 6. Follow-up of their ministries' members (db/032, db/033)
-- ---------------------------------------------------------------------
create or replace function public.can_follow_up_member(mid bigint, cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_follow_up(cid) or public.in_my_headed_ministry(mid);
$$;

drop policy if exists "followups read"   on public.member_followups;
drop policy if exists "followups insert" on public.member_followups;
create policy "followups read"
  on public.member_followups for select to authenticated
  using (public.can_follow_up_member(member_id, church_id));
create policy "followups insert"
  on public.member_followups for insert to authenticated
  with check (public.can_follow_up_member(member_id, church_id));

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
  last_by          text
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
    coalesce(nullif(trim(bp.full_name), ''), split_part(bp.email, '@', 1))
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

create or replace function public.member_followup_history(mid bigint)
returns table (id bigint, outcome text, note text, created_at timestamptz, by_name text)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.outcome, f.note, f.created_at,
         coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1), 'Unknown')
  from member_followups f
  join members m on m.id = f.member_id
  left join profiles p on p.id = f.created_by
  where f.member_id = mid
    and public.can_follow_up_member(m.id, m.church_id)
  order by f.created_at desc, f.id desc;
$$;

create or replace function public.followup_due(away_days integer default 30)
returns table (member_id bigint, full_name text, last_seen timestamptz, member_status text)
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
                ), '-infinity'::timestamptz) end as last_seen
    from members m
    left join auth.users u on u.id = m.profile_id
    where m.status is distinct from 'archived'
      and public.can_follow_up_member(m.id, m.church_id)
  )
  select s.id, s.full_name, s.last_seen, s.status
  from seen s
  where (
          (s.profile_id is not null and (s.last_seen is null or s.last_seen < now() - make_interval(days => greatest(away_days, 1))))
          or s.status = 'inactive'
        )
    and not exists (
          select 1 from member_followups f
           where f.member_id = s.id
             and f.created_at >= now() - make_interval(days => greatest(away_days, 1))
        )
  order by s.last_seen nulls first, s.full_name;
$$;

revoke all on function
  public.in_my_headed_ministry(bigint), public.is_my_headed_module(bigint),
  public.heads_ministry_named(text, uuid), public.can_edit_announcement(uuid, uuid),
  public.am_in_ministry(uuid), public.can_follow_up_member(bigint, uuid)
  from anon, public;
grant execute on function
  public.in_my_headed_ministry(bigint), public.is_my_headed_module(bigint),
  public.heads_ministry_named(text, uuid), public.can_edit_announcement(uuid, uuid),
  public.am_in_ministry(uuid), public.can_follow_up_member(bigint, uuid)
  to authenticated;

commit;
