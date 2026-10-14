-- =====================================================================
-- 051 — Cancelled events, and reminders for attendance not taken
--
-- Run in Supabase → SQL Editor, after 050. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- 1. Cancel instead of delete. A Leader can cancel an approved event (with
--    an optional reason, e.g. "moved to next week — typhoon"). Members
--    still see it, marked Cancelled, and it stays in the records; it can be
--    restored. Delete stays for mistakes.
--      events.status        adds 'cancelled'
--      events.cancel_note   the reason
--      events.cancelled_by / cancelled_at   stamped by the database
--    Cancelled events never become Done, take no attendance and don't count
--    as upcoming or as missed.
--
-- 2. Attendance reminders. attendance_missing() lists the caller's events
--    from the last 14 days whose attendance nobody took — for Leaders and
--    the Secretary, own branch. "Not needed" (skip_attendance) takes an
--    event off the list for good (events.no_attendance), e.g. a planning
--    meeting nobody signs in at.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Columns and the status list
-- ---------------------------------------------------------------------
alter table public.events
  add column if not exists cancel_note   text check (cancel_note is null or length(cancel_note) <= 500),
  add column if not exists cancelled_by  uuid,
  add column if not exists cancelled_at  timestamptz,
  add column if not exists no_attendance boolean not null default false;

-- Any earlier check on events.status (made in the Supabase dashboard, not
-- in these files) is replaced by one that knows 'cancelled'. "not valid":
-- existing rows aren't re-checked, so an odd old value can't stop this.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.events'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.events drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.events add constraint events_status_check
  check (status in ('planning', 'pending', 'approved', 'done', 'cancelled')) not valid;

-- Who cancelled and when: set by the database, cleared on restore.
create or replace function public.events_cancel_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if old.status not in ('approved', 'done') then
      raise exception 'Only an approved event can be cancelled. Delete it instead.';
    end if;
    new.cancelled_by := auth.uid();
    new.cancelled_at := now();
  elsif new.status is distinct from 'cancelled' and old.status = 'cancelled' then
    new.cancelled_by := null;
    new.cancelled_at := null;
    new.cancel_note  := null;
  else
    new.cancelled_by := old.cancelled_by;
    new.cancelled_at := old.cancelled_at;
  end if;
  return new;
end;
$$;

drop trigger if exists events_cancel_stamp on public.events;
create trigger events_cancel_stamp
  before update on public.events
  for each row execute function public.events_cancel_stamp();

-- Members see cancelled events too (was approved / done, db/044).
drop policy if exists "view events scoped" on public.events;
create policy "view events scoped"
  on public.events for select to authenticated
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (church_id = public.get_my_church_id()
        and (public.get_my_role() in ('leader', 'finance', 'secretary')
             or status in ('approved', 'done', 'cancelled')))
    or created_by = auth.uid()
  );

-- ---------------------------------------------------------------------
-- Attendance not taken
-- ---------------------------------------------------------------------
create or replace function public.attendance_missing()
returns table (id bigint, title text, date date, church_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.title, e.date, e.church_id
  from events e
  where public.get_my_role() in ('leader', 'secretary')
    and e.church_id = public.get_my_church_id()
    and e.status in ('approved', 'done')
    and not e.no_attendance
    and e.date < public.ph_today()
    and e.date >= public.ph_today() - 14
    and not exists (select 1 from event_attendance a where a.event_id = e.id)
    and not exists (select 1 from event_visitors v where v.event_id = e.id)
  order by e.date desc, e.id desc;
$$;

create or replace function public.skip_attendance(p_event bigint)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if public.get_my_role() not in ('leader', 'secretary') or not public.can_take_attendance(p_event) then
    raise exception 'You can''t change this event.';
  end if;
  update events set no_attendance = true where id = p_event;
end;
$$;

revoke all on function public.attendance_missing(), public.skip_attendance(bigint) from anon, public;
grant execute on function public.attendance_missing(), public.skip_attendance(bigint) to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect columns = 4 and functions = 3.
--
-- select count(*) as columns from information_schema.columns
--  where table_schema = 'public' and table_name = 'events'
--    and column_name in ('cancel_note', 'cancelled_by', 'cancelled_at', 'no_attendance');
-- select count(*) as functions from pg_proc
--  where pronamespace = 'public'::regnamespace
--    and proname in ('events_cancel_stamp', 'attendance_missing', 'skip_attendance');
-- =====================================================================
