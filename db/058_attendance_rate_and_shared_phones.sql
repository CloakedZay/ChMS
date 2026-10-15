-- =====================================================================
-- 058 — Attendance rate counts every member; visitors sharing a phone
--
-- Run in Supabase → SQL Editor, after 057. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- 1. The attendance rate was "members present ÷ Active members". Since
--    members turn Inactive by themselves after 2 weeks away (db/056), the
--    Active count shrank and the rate looked better than it was. Now it's
--    present ÷ every member of the branch who isn't archived or Busy.
--    (Column name active_members is kept, so the pages still work.)
--    attendance_events also says when an event was marked "Not needed"
--    (no_attendance, db/051). The old Ministry Head clauses are gone
--    (db/050 removed that level).
--
-- 2. A new visitor with the phone number of an earlier visitor was always
--    treated as that visitor — wrong when a family shares one phone. Now
--    the page asks first (visitor_by_phone), and add_event_visitor takes
--    p_new_person = true to add them as a different person.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Events with their counts
-- ---------------------------------------------------------------------
drop function if exists public.attendance_events(uuid);

create function public.attendance_events(p_church uuid default null)
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
  can_mark        boolean,
  no_attendance   boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.title, e.ministry, e.date, e.status, e.church_id,
         (select count(*)::int from event_attendance a where a.event_id = e.id),
         (select count(*)::int from event_visitors v where v.event_id = e.id),
         (select count(*)::int from members m
           where m.church_id = e.church_id
             and coalesce(m.status, 'active') not in ('archived', 'busy')),
         public.can_take_attendance(e.id),
         e.no_attendance
  from events e
  where e.status in ('approved', 'done')
    and e.date <= public.ph_today()
    and (p_church is null or e.church_id = p_church)
    and (public.can_view_attendance(e.church_id)
         or (public.is_attendance_helper() and e.church_id = public.get_my_church_id()))
  order by e.date desc, e.id desc
  limit 500;
$$;

revoke all on function public.attendance_events(uuid) from anon, public;
grant execute on function public.attendance_events(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Shared phone numbers
-- ---------------------------------------------------------------------
-- An earlier visitor of the event's branch with this phone number.
create or replace function public.visitor_by_phone(p_event bigint, p_phone text)
returns table (visitor_id bigint, full_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  cid  uuid;
  pkey text := nullif(regexp_replace(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '^63(\d{10})$', '0\1'), '');
begin
  if not public.can_take_attendance(p_event) then
    raise exception 'You can''t take attendance for this event.';
  end if;
  if pkey is null then return; end if;
  select church_id into cid from events where id = p_event;
  return query
  select v.id, v.full_name from visitors v
  where v.church_id = cid and v.phone_key = pkey
  order by v.id
  limit 1;
end;
$$;

drop function if exists public.add_event_visitor(bigint, bigint, text, text, text);

-- Same as db/041, plus p_new_person: true = don't match by phone.
create function public.add_event_visitor(
  p_event      bigint,
  p_visitor    bigint default null,
  p_name       text default null,
  p_phone      text default null,
  p_invited_by text default null,
  p_new_person boolean default false
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
    if pkey is not null and not p_new_person then
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

revoke all on function public.visitor_by_phone(bigint, text) from anon, public;
revoke all on function public.add_event_visitor(bigint, bigint, text, text, text, boolean) from anon, public;
grant execute on function public.visitor_by_phone(bigint, text) to authenticated;
grant execute on function public.add_event_visitor(bigint, bigint, text, text, text, boolean) to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 'no_attendance column' = true,
-- 'visitor_by_phone' = 1 and 'add_event_visitor versions' = 1.
--
-- select 'no_attendance column' as check_name,
--        (pg_get_function_result('public.attendance_events(uuid)'::regprocedure) like '%no_attendance%')::text as result
-- union all
-- select 'visitor_by_phone', count(*)::text from pg_proc where proname = 'visitor_by_phone'
-- union all
-- select 'add_event_visitor versions', count(*)::text from pg_proc where proname = 'add_event_visitor';
-- =====================================================================
