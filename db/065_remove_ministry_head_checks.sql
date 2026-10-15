-- =====================================================================
-- 065 — Tidy-up: the last "Ministry Head" checks are removed
--
-- Run in Supabase → SQL Editor, after 064. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- db/050 turned every Ministry Head into a Leader, and no login can have
-- that level any more, but some rules still checked for it. They never
-- matched anyone, so removing them changes nothing anyone can do:
--
--   functions   is_ministry_head, can_edit_module_group,
--               can_edit_announcement, can_write_knowledge,
--               guard_discipleship_progress, can_take_attendance,
--               can_view_attendance, attendance_sheet, event_visitor_list,
--               can_follow_up_member — same as before without the
--               Ministry Head part
--   removed     the four "ministry head ..." rules on members and
--               training answers, and in_my_headed_ministry /
--               is_my_headed_module, which only they used
--   profiles    "staff read profiles scoped" without Ministry Head
--
-- A Leader who heads a ministry keeps everything (is_ministry_head).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Rules that only applied to the old level
-- ---------------------------------------------------------------------
drop policy if exists "ministry head reads their members" on public.members;
drop policy if exists "ministry head reads answers"       on public.discipleship_progress;
drop policy if exists "ministry head reads module views"  on public.module_views;
drop policy if exists "ministry head reviews answers"     on public.discipleship_progress;

drop policy if exists "staff read profiles scoped" on public.profiles;
create policy "staff read profiles scoped"
  on public.profiles for select to authenticated
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('leader', 'secretary') and church_id = public.get_my_church_id())
  );

-- ---------------------------------------------------------------------
-- Functions without the Ministry Head part
-- ---------------------------------------------------------------------
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
      and public.get_my_role() = 'leader'
  );
$$;

create or replace function public.can_edit_module_group(min_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.get_my_role()
           when 'pastor' then true
           when 'leader' then min_id is null or public.is_ministry_head(min_id)
           else false
         end;
$$;

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
    else false
  end;
$$;

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
      public.get_my_role() in ('pastor', 'leader') and public.can_edit_module(mod_id)
    else false
  end;
$$;

create or replace function public.guard_discipleship_progress()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.get_my_role() in ('pastor', 'leader')
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

create or replace function public.can_follow_up_member(mid bigint, cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_follow_up(cid);
$$;

create or replace function public.can_take_attendance(p_event bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from events e
    where e.id = p_event
      and e.status in ('approved', 'done')
      and e.date <= public.ph_today()
      and (
        public.get_my_role() = 'pastor'
        or (public.get_my_role() in ('leader', 'secretary') and e.church_id = public.get_my_church_id())
        or (public.is_attendance_helper() and e.church_id = public.get_my_church_id())
      )
  );
$$;

create or replace function public.can_view_attendance(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.get_my_role() in ('admin', 'pastor') then true
    when public.get_my_role() in ('leader', 'secretary', 'finance')
      then cid is not null and cid = public.get_my_church_id()
    else false
  end;
$$;

create or replace function public.attendance_sheet(p_event bigint)
returns table (
  member_id   bigint,
  full_name   text,
  status      text,
  ministries  text,
  in_ministry boolean,
  present     boolean
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  ev events%rowtype;
begin
  select * into ev from events where events.id = p_event;
  if not found or not (public.can_take_attendance(p_event)
                       or public.can_view_attendance(ev.church_id)) then
    raise exception 'You can''t see attendance for this event.';
  end if;

  perform public.purge_old_visitors();

  return query
  select m.id, m.full_name, coalesce(m.status, 'active'),
         (select string_agg(mi.name, ', ' order by mi.name)
            from ministry_assignments ma join ministries mi on mi.id = ma.ministry_id
           where ma.member_id = m.id and mi.is_active),
         (m.ministry = ev.ministry or exists (
            select 1 from ministry_assignments ma join ministries mi on mi.id = ma.ministry_id
             where ma.member_id = m.id and mi.name = ev.ministry and mi.church_id = ev.church_id)),
         exists (select 1 from event_attendance a where a.event_id = p_event and a.member_id = m.id)
  from members m
  where m.church_id = ev.church_id
    and (coalesce(m.status, 'active') <> 'archived'
         or exists (select 1 from event_attendance a where a.event_id = p_event and a.member_id = m.id))
  order by m.full_name;
end;
$$;

create or replace function public.event_visitor_list(p_event bigint)
returns table (
  visitor_id bigint,
  full_name  text,
  phone      text,
  invited_by text,
  visits     integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  cid uuid;
begin
  select church_id into cid from events where id = p_event;
  if cid is null or not (public.can_take_attendance(p_event) or public.can_view_attendance(cid)) then
    raise exception 'You can''t see attendance for this event.';
  end if;

  return query
  select v.id, v.full_name, public.visitor_phone(v), v.invited_by,
         (select count(*)::int from event_visitors x where x.visitor_id = v.id)
  from event_visitors ev join visitors v on v.id = ev.visitor_id
  where ev.event_id = p_event
  order by ev.marked_at;
end;
$$;

drop function if exists public.in_my_headed_ministry(bigint);
drop function if exists public.is_my_headed_module(bigint);

commit;

-- =====================================================================
-- Verify (run after commit). Expect 0: no function or rule mentions the
-- old level any more.
--
-- select count(*) as left_over from (
--   select proname from pg_proc
--    where pronamespace = 'public'::regnamespace and prosrc like '%''ministry_head''%'
--   union all
--   select policyname from pg_policies
--    where schemaname = 'public' and (qual like '%''ministry_head''%' or with_check like '%''ministry_head''%')
-- ) x;
-- =====================================================================
