-- =====================================================================
-- 095 — Minutes of meetings, in Reports
--
-- Run in Supabase → SQL Editor, after 094. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- The Secretary writes the minutes (a summary) of each meeting for their
-- branch: date, title, who attended, what was discussed, what was decided
-- and who does what next. They show on the Reports page and in its PDF.
--   Write (add, edit, delete)  the Secretary, own branch
--   Read                       the Admin and Pastor (every branch), the
--                              Secretary and Leaders (own branch)
-- Finance and Members don't see them.
-- =====================================================================

begin;

create table if not exists public.meeting_minutes (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  church_id    uuid not null references public.churches (id) on delete cascade,
  meeting_date date not null,
  title        text not null check (length(trim(title)) between 1 and 150),
  attendees    text check (attendees is null or length(attendees) <= 2000),
  summary      text not null check (length(trim(summary)) between 1 and 20000),
  decisions    text check (decisions is null or length(decisions) <= 10000),
  action_items text check (action_items is null or length(action_items) <= 10000),
  created_by   uuid default auth.uid(),
  author_name  text
);

create index if not exists meeting_minutes_church_date_idx on public.meeting_minutes (church_id, meeting_date desc);

alter table public.meeting_minutes enable row level security;

create or replace function public.guard_meeting_minutes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.created_by := auth.uid();
    new.created_at := now();
    select coalesce(nullif(trim(full_name), ''), split_part(email, '@', 1)) into new.author_name
      from profiles where id = auth.uid();
  elsif tg_op = 'UPDATE' then
    new.created_by  := old.created_by;
    new.created_at  := old.created_at;
    new.author_name := old.author_name;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guard_meeting_minutes on public.meeting_minutes;
create trigger trg_guard_meeting_minutes
  before insert or update on public.meeting_minutes
  for each row execute function public.guard_meeting_minutes();

drop policy if exists "read meeting minutes" on public.meeting_minutes;
create policy "read meeting minutes"
  on public.meeting_minutes for select to authenticated
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('secretary', 'leader') and church_id = public.get_my_church_id())
  );

drop policy if exists "write meeting minutes" on public.meeting_minutes;
create policy "write meeting minutes"
  on public.meeting_minutes for all to authenticated
  using      (public.get_my_role() = 'secretary' and church_id = public.get_my_church_id())
  with check (public.get_my_role() = 'secretary' and church_id = public.get_my_church_id());

revoke all on public.meeting_minutes from anon, public;
grant select, insert, update, delete on public.meeting_minutes to authenticated;

drop trigger if exists trg_log_activity on public.meeting_minutes;
create trigger trg_log_activity
  after insert or update or delete on public.meeting_minutes
  for each row execute function public.log_activity();

commit;

-- =====================================================================
-- Verify (run after commit). Expect 2 rows.
--
-- select policyname, cmd from pg_policies where tablename = 'meeting_minutes';
-- =====================================================================
