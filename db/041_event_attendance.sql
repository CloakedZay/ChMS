-- =====================================================================
-- 041 — Event attendance, visitors and attendance helpers
--
-- Run in Supabase → SQL Editor, after 040. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- At an event people sign a paper sheet; visitors also write a phone
-- number. Afterwards the Secretary or a volunteer ticks the members on the
-- sheet and adds the visitors.
--
-- event_attendance   one row per member present at an event
-- visitors           non-members, per branch: name, phone, who invited
--                    them. "Temporary": deleted 6 months after their last
--                    visit (Data Privacy Act), or moved into members by
--                    "Make member"
-- event_visitors     one row per visitor present at an event
-- attendance_helpers member logins the Pastor / Secretary allow to take
--                    attendance in their own branch (volunteers)
--
-- Who takes attendance (approved or done events, from the event's date on):
--   Pastor any event · Leader, Secretary own branch · Ministry Head events
--   of the ministries they head · attendance helper own branch.
-- Who sees attendance: the above, plus Admin (all) and Finance (own
-- branch); a member sees their own.
-- Visitors' phone numbers: the follow-up roles (can_follow_up). A helper
-- sees only the last 4 digits of numbers they didn't type in just now.
--
-- All writes go through the functions below, which check all of this;
-- the tables themselves can only be read.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.attendance_helpers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  added_by   uuid default auth.uid(),
  added_at   timestamptz not null default now()
);

create table if not exists public.event_attendance (
  event_id  bigint not null references public.events(id) on delete cascade,
  member_id bigint not null references public.members(id) on delete cascade,
  marked_by uuid default auth.uid(),
  marked_at timestamptz not null default now(),
  primary key (event_id, member_id)
);
create index if not exists event_attendance_member_idx on public.event_attendance (member_id);

create table if not exists public.visitors (
  id         bigint generated always as identity primary key,
  church_id  uuid not null,
  full_name  text not null check (length(btrim(full_name)) between 1 and 120),
  phone      text check (phone is null or length(phone) <= 40),
  -- digits only, +63 / 63 written as 0, so "0917 123 4567" = "+639171234567"
  phone_key  text generated always as (
               nullif(regexp_replace(
                 regexp_replace(coalesce(phone, ''), '\D', '', 'g'),
                 '^63(\d{10})$', '0\1'), '')
             ) stored,
  invited_by text check (invited_by is null or length(invited_by) <= 120),
  note       text check (note is null or length(note) <= 1000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists visitors_church_idx on public.visitors (church_id);
create index if not exists visitors_phone_idx  on public.visitors (church_id, phone_key);

create table if not exists public.event_visitors (
  event_id   bigint not null references public.events(id) on delete cascade,
  visitor_id bigint not null references public.visitors(id) on delete cascade,
  marked_by  uuid default auth.uid(),
  marked_at  timestamptz not null default now(),
  primary key (event_id, visitor_id)
);
create index if not exists event_visitors_visitor_idx on public.event_visitors (visitor_id);

-- ---------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------
create or replace function public.is_attendance_helper()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from attendance_helpers h
    join profiles p on p.id = h.profile_id
    where h.profile_id = auth.uid() and not coalesce(p.disabled, false)
  );
$$;

-- Today in the Philippines (events have a date, no time).
create or replace function public.ph_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Asia/Manila')::date; $$;

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
        or (public.get_my_role() = 'ministry_head' and public.heads_ministry_named(e.ministry, e.church_id))
        or (public.is_attendance_helper() and e.church_id = public.get_my_church_id())
      )
  );
$$;

-- May the caller see attendance of this branch (counts, lists, reports)?
create or replace function public.can_view_attendance(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.get_my_role() in ('admin', 'pastor') then true
    when public.get_my_role() in ('leader', 'secretary', 'ministry_head', 'finance')
      then cid is not null and cid = public.get_my_church_id()
    else false
  end;
$$;

-- Pastor (any branch) or Secretary (own branch) manage helpers and turn
-- visitors into members.
create or replace function public.can_manage_people(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_my_role() = 'pastor'
      or (public.get_my_role() = 'secretary' and cid is not null and cid = public.get_my_church_id());
$$;

create or replace function public.am_i_attendance_helper()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.is_attendance_helper(); $$;

-- ---------------------------------------------------------------------
-- Read access to the tables
-- ---------------------------------------------------------------------
alter table public.attendance_helpers enable row level security;
alter table public.event_attendance   enable row level security;
alter table public.visitors           enable row level security;
alter table public.event_visitors     enable row level security;

drop policy if exists "helpers read" on public.attendance_helpers;
create policy "helpers read"
  on public.attendance_helpers for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (select 1 from profiles p where p.id = profile_id and public.can_manage_people(p.church_id))
  );

drop policy if exists "attendance read" on public.event_attendance;
create policy "attendance read"
  on public.event_attendance for select to authenticated
  using (
    exists (select 1 from members m where m.id = member_id and m.profile_id = auth.uid())
    or exists (select 1 from events e where e.id = event_id and public.can_view_attendance(e.church_id))
  );

drop policy if exists "visitors read" on public.visitors;
create policy "visitors read"
  on public.visitors for select to authenticated
  using (public.can_follow_up(church_id));

drop policy if exists "visitors edit" on public.visitors;
create policy "visitors edit"
  on public.visitors for update to authenticated
  using (public.can_follow_up(church_id))
  with check (public.can_follow_up(church_id));

drop policy if exists "visitors delete" on public.visitors;
create policy "visitors delete"
  on public.visitors for delete to authenticated
  using (public.can_follow_up(church_id));

drop policy if exists "event visitors read" on public.event_visitors;
create policy "event visitors read"
  on public.event_visitors for select to authenticated
  using (exists (select 1 from events e where e.id = event_id and public.can_view_attendance(e.church_id)));

revoke all on public.attendance_helpers, public.event_attendance, public.visitors, public.event_visitors from anon, public;
grant select on public.attendance_helpers, public.event_attendance, public.event_visitors to authenticated;
grant select, update, delete on public.visitors to authenticated;

-- ---------------------------------------------------------------------
-- Visitors are temporary: gone 6 months after their last visit.
-- Runs whenever the attendance or visitor lists are opened.
-- ---------------------------------------------------------------------
create or replace function public.purge_old_visitors()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from visitors v
  where coalesce(
          (select max(e.date) from event_visitors ev join events e on e.id = ev.event_id where ev.visitor_id = v.id),
          v.created_at::date
        ) < public.ph_today() - interval '6 months';
$$;

-- ---------------------------------------------------------------------
-- Events the caller can see attendance for, with counts
-- ---------------------------------------------------------------------
create or replace function public.attendance_events(p_church uuid default null)
returns table (
  id              bigint,
  title           text,
  ministry        text,
  date            date,
  status          text,
  church_id       uuid,
  members_present integer,
  visitors        integer,
  active_members  integer,
  can_mark        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.title, e.ministry, e.date, e.status, e.church_id,
         (select count(*)::int from event_attendance a where a.event_id = e.id),
         (select count(*)::int from event_visitors v where v.event_id = e.id),
         (select count(*)::int from members m where m.church_id = e.church_id and coalesce(m.status, 'active') = 'active'),
         public.can_take_attendance(e.id)
  from events e
  where e.status in ('approved', 'done')
    and e.date <= public.ph_today()
    and (p_church is null or e.church_id = p_church)
    and (public.can_view_attendance(e.church_id)
         or (public.is_attendance_helper() and e.church_id = public.get_my_church_id())
         or (public.get_my_role() = 'ministry_head' and public.heads_ministry_named(e.ministry, e.church_id)))
  order by e.date desc, e.id desc
  limit 500;
$$;

-- ---------------------------------------------------------------------
-- The sheet: the branch's members, ticked when present
-- ---------------------------------------------------------------------
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
                       or public.can_view_attendance(ev.church_id)
                       or (public.get_my_role() = 'ministry_head' and public.heads_ministry_named(ev.ministry, ev.church_id))) then
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

-- Tick or untick one or more members.
create or replace function public.set_attendance(p_event bigint, p_members bigint[], p_present boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.can_take_attendance(p_event) then
    raise exception 'You can''t take attendance for this event.';
  end if;

  if p_present then
    insert into event_attendance (event_id, member_id)
    select p_event, m.id
    from members m join events e on e.id = p_event
    where m.id = any(p_members) and m.church_id = e.church_id
    on conflict do nothing;
  else
    delete from event_attendance where event_id = p_event and member_id = any(p_members);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Visitors at an event
-- ---------------------------------------------------------------------
-- Phone shown in full to the follow-up roles; to others only the last 4
-- digits.
create or replace function public.visitor_phone(v visitors)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when v.phone is null then null
    when public.can_follow_up(v.church_id) then v.phone
    else '••• ' || right(coalesce(v.phone_key, v.phone), 4)
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
  if cid is null or not (public.can_take_attendance(p_event) or public.can_view_attendance(cid)
                         or exists (select 1 from events e where e.id = p_event and public.get_my_role() = 'ministry_head'
                                    and public.heads_ministry_named(e.ministry, e.church_id))) then
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

-- Earlier visitors of the event's branch, by name or phone digits.
create or replace function public.find_visitors(p_event bigint, p_query text)
returns table (
  visitor_id bigint,
  full_name  text,
  phone      text,
  visits     integer,
  last_visit date
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  cid    uuid;
  q      text := btrim(coalesce(p_query, ''));
  digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
begin
  if not public.can_take_attendance(p_event) then
    raise exception 'You can''t take attendance for this event.';
  end if;
  if length(q) < 2 then return; end if;
  select church_id into cid from events where id = p_event;

  return query
  select v.id, v.full_name, public.visitor_phone(v),
         (select count(*)::int from event_visitors x where x.visitor_id = v.id),
         (select max(e.date) from event_visitors x join events e on e.id = x.event_id where x.visitor_id = v.id)
  from visitors v
  where v.church_id = cid
    and not exists (select 1 from event_visitors x where x.visitor_id = v.id and x.event_id = p_event)
    and (v.full_name ilike '%' || q || '%'
         or (length(digits) >= 4 and v.phone_key like '%' || digits || '%'))
  order by v.full_name
  limit 8;
end;
$$;

-- Add a visitor to an event: an earlier visitor (p_visitor), or a new one.
-- A new one with the phone number of an earlier visitor of the branch is
-- that visitor — no duplicates for the same person.
create or replace function public.add_event_visitor(
  p_event      bigint,
  p_visitor    bigint default null,
  p_name       text default null,
  p_phone      text default null,
  p_invited_by text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cid  uuid;
  vid  bigint;
  pkey text;
begin
  if not public.can_take_attendance(p_event) then
    raise exception 'You can''t take attendance for this event.';
  end if;
  select church_id into cid from events where id = p_event;

  if p_visitor is not null then
    select id into vid from visitors where id = p_visitor and church_id = cid;
    if vid is null then raise exception 'Visitor not found in this branch.'; end if;
  else
    if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'Enter the visitor''s name.'; end if;
    pkey := nullif(regexp_replace(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '^63(\d{10})$', '0\1'), '');
    if pkey is not null then
      select id into vid from visitors where church_id = cid and phone_key = pkey order by id limit 1;
    end if;
    if vid is null then
      insert into visitors (church_id, full_name, phone, invited_by)
      values (cid, btrim(p_name), nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_invited_by, '')), ''))
      returning id into vid;
    end if;
  end if;

  insert into event_visitors (event_id, visitor_id) values (p_event, vid) on conflict do nothing;
  return vid;
end;
$$;

-- Take a visitor off an event. A visitor left with no visits at all was
-- added by mistake, so they're removed completely.
create or replace function public.remove_event_visitor(p_event bigint, p_visitor bigint)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.can_take_attendance(p_event) then
    raise exception 'You can''t take attendance for this event.';
  end if;
  delete from event_visitors where event_id = p_event and visitor_id = p_visitor;
  delete from visitors v
   where v.id = p_visitor
     and not exists (select 1 from event_visitors x where x.visitor_id = v.id);
end;
$$;

-- ---------------------------------------------------------------------
-- Visitors list (Follow-up page)
-- ---------------------------------------------------------------------
create or replace function public.visitor_list()
returns table (
  visitor_id  bigint,
  full_name   text,
  phone       text,
  invited_by  text,
  note        text,
  church_id   uuid,
  visits      integer,
  first_visit date,
  last_visit  date,
  last_event  text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.purge_old_visitors();
  return query
  select v.id, v.full_name, v.phone, v.invited_by, v.note, v.church_id,
         (select count(*)::int from event_visitors x where x.visitor_id = v.id),
         (select min(e.date) from event_visitors x join events e on e.id = x.event_id where x.visitor_id = v.id),
         (select max(e.date) from event_visitors x join events e on e.id = x.event_id where x.visitor_id = v.id),
         (select e.title from event_visitors x join events e on e.id = x.event_id
           where x.visitor_id = v.id order by e.date desc, e.id desc limit 1)
  from visitors v
  where public.can_follow_up(v.church_id)
  order by 9 desc nulls last, v.full_name;
end;
$$;

-- "Make member": a members record with the visitor's details; their
-- visits become attendance; the visitor entry is removed.
create or replace function public.make_visitor_member(p_visitor bigint)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v   visitors%rowtype;
  mid bigint;
begin
  select * into v from visitors where id = p_visitor;
  if not found then raise exception 'Visitor not found.'; end if;
  if not public.can_manage_people(v.church_id) then
    raise exception 'Only the Pastor or the Secretary can add members.';
  end if;

  insert into members (full_name, phone, church_id, status, role)
  values (v.full_name, v.phone, v.church_id, 'active', 'member')
  returning id into mid;

  insert into event_attendance (event_id, member_id, marked_by, marked_at)
  select ev.event_id, mid, ev.marked_by, ev.marked_at from event_visitors ev where ev.visitor_id = v.id
  on conflict do nothing;

  delete from visitors where id = v.id;
  return mid;
end;
$$;

-- ---------------------------------------------------------------------
-- Attendance helpers (Members page)
-- ---------------------------------------------------------------------
create or replace function public.set_attendance_helper(p_member bigint, p_on boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m members%rowtype;
begin
  select * into m from members where id = p_member;
  if not found then raise exception 'Member not found.'; end if;
  if not public.can_manage_people(m.church_id) then
    raise exception 'Only the Pastor or the Secretary can choose attendance helpers.';
  end if;
  if m.profile_id is null then
    raise exception 'This member has no login yet. Create one first.';
  end if;

  if p_on then
    insert into attendance_helpers (profile_id) values (m.profile_id) on conflict do nothing;
  else
    delete from attendance_helpers where profile_id = m.profile_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- A member's own attendance
-- ---------------------------------------------------------------------
create or replace function public.my_attendance()
returns table (event_id bigint, title text, ministry text, date date)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.title, e.ministry, e.date
  from event_attendance a
  join members m on m.id = a.member_id
  join events e on e.id = a.event_id
  where m.profile_id = auth.uid()
  order by e.date desc, e.id desc;
$$;

-- ---------------------------------------------------------------------
-- Function access
-- ---------------------------------------------------------------------
revoke all on function public.is_attendance_helper()                  from anon, public;
revoke all on function public.can_take_attendance(bigint)             from anon, public;
revoke all on function public.can_view_attendance(uuid)               from anon, public;
revoke all on function public.can_manage_people(uuid)                 from anon, public;
revoke all on function public.am_i_attendance_helper()                from anon, public;
revoke all on function public.purge_old_visitors()                    from anon, public;
revoke all on function public.attendance_events(uuid)                 from anon, public;
revoke all on function public.attendance_sheet(bigint)                from anon, public;
revoke all on function public.set_attendance(bigint, bigint[], boolean) from anon, public;
revoke all on function public.visitor_phone(public.visitors)          from anon, public;
revoke all on function public.event_visitor_list(bigint)              from anon, public;
revoke all on function public.find_visitors(bigint, text)             from anon, public;
revoke all on function public.add_event_visitor(bigint, bigint, text, text, text) from anon, public;
revoke all on function public.remove_event_visitor(bigint, bigint)    from anon, public;
revoke all on function public.visitor_list()                          from anon, public;
revoke all on function public.make_visitor_member(bigint)             from anon, public;
revoke all on function public.set_attendance_helper(bigint, boolean)  from anon, public;
revoke all on function public.my_attendance()                         from anon, public;

grant execute on function public.is_attendance_helper()                  to authenticated;
grant execute on function public.can_take_attendance(bigint)             to authenticated;
grant execute on function public.can_view_attendance(uuid)               to authenticated;
grant execute on function public.can_manage_people(uuid)                 to authenticated;
grant execute on function public.am_i_attendance_helper()                to authenticated;
grant execute on function public.attendance_events(uuid)                 to authenticated;
grant execute on function public.attendance_sheet(bigint)                to authenticated;
grant execute on function public.set_attendance(bigint, bigint[], boolean) to authenticated;
grant execute on function public.event_visitor_list(bigint)              to authenticated;
grant execute on function public.find_visitors(bigint, text)             to authenticated;
grant execute on function public.add_event_visitor(bigint, bigint, text, text, text) to authenticated;
grant execute on function public.remove_event_visitor(bigint, bigint)    to authenticated;
grant execute on function public.visitor_list()                          to authenticated;
grant execute on function public.make_visitor_member(bigint)             to authenticated;
grant execute on function public.set_attendance_helper(bigint, boolean)  to authenticated;
grant execute on function public.my_attendance()                         to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 4 tables and 'functions' = 19.
--
-- select count(*) as tables from information_schema.tables
--  where table_schema = 'public'
--    and table_name in ('attendance_helpers', 'event_attendance', 'visitors', 'event_visitors');
-- select count(*) as functions from pg_proc
--  where pronamespace = 'public'::regnamespace
--    and proname in ('is_attendance_helper', 'ph_today', 'can_take_attendance', 'can_view_attendance',
--                    'can_manage_people', 'am_i_attendance_helper', 'purge_old_visitors', 'attendance_events',
--                    'attendance_sheet', 'set_attendance', 'visitor_phone', 'event_visitor_list',
--                    'find_visitors', 'add_event_visitor', 'remove_event_visitor', 'visitor_list',
--                    'make_visitor_member', 'set_attendance_helper', 'my_attendance');
-- =====================================================================
