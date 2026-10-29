-- =====================================================================
-- 094 — Photos of every gathering
--
-- Run in Supabase → SQL Editor, after 093. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- A photo album on each event, once it has happened. Who adds and removes
-- photos: the Pastor (any branch), and the Secretary, Leaders and
-- attendance helpers of the event's branch. Who sees them: everyone who
-- can see the event (the events table's own rules decide, so members see
-- their branch's albums).
--
-- Unlike the sign-in sheet photos (db/060), these are kept — they are the
-- church's memories. Files live in a private storage bucket
-- 'event-photos', in a folder named after the event number
-- (sheet_event_id() from db/060 reads it).
-- =====================================================================

begin;

create or replace function public.can_add_event_photos(p_event bigint)
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
        or (e.church_id = public.get_my_church_id()
            and (public.get_my_role() in ('secretary', 'leader') or public.is_attendance_helper()))
      )
  );
$$;

create table if not exists public.event_photos (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  event_id      bigint not null references public.events (id) on delete cascade,
  file_path     text not null unique,
  file_name     text not null,
  file_size     bigint,
  caption       text check (caption is null or length(caption) <= 200),
  uploaded_by   uuid not null default auth.uid(),
  uploader_name text
);

create index if not exists event_photos_event_idx on public.event_photos (event_id);

alter table public.event_photos enable row level security;

create or replace function public.guard_event_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.uploaded_by := auth.uid();
    new.created_at  := now();
    select coalesce(nullif(trim(full_name), ''), split_part(email, '@', 1)) into new.uploader_name
      from profiles where id = auth.uid();
    if public.sheet_event_id(new.file_path) is distinct from new.event_id then
      raise exception 'The photo must be stored in the event''s folder';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_event_photo on public.event_photos;
create trigger trg_guard_event_photo
  before insert on public.event_photos
  for each row execute function public.guard_event_photo();

-- Readers: whoever can see the event (the subquery runs under the events
-- table's own rules).
drop policy if exists "read event photos" on public.event_photos;
create policy "read event photos"
  on public.event_photos for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id));

drop policy if exists "add event photos" on public.event_photos;
create policy "add event photos"
  on public.event_photos for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_add_event_photos(event_id));

drop policy if exists "remove event photos" on public.event_photos;
create policy "remove event photos"
  on public.event_photos for delete to authenticated
  using (public.can_add_event_photos(event_id));

revoke all on public.event_photos from anon, public;
grant select, insert, delete on public.event_photos to authenticated;

insert into storage.buckets (id, name, public)
values ('event-photos', 'event-photos', false)
on conflict (id) do nothing;

drop policy if exists "read event photo files" on storage.objects;
create policy "read event photo files"
  on storage.objects for select to authenticated
  using (bucket_id = 'event-photos'
         and exists (select 1 from public.events e where e.id = public.sheet_event_id(name)));

drop policy if exists "upload event photo files" on storage.objects;
create policy "upload event photo files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'event-photos' and public.can_add_event_photos(public.sheet_event_id(name)));

drop policy if exists "delete event photo files" on storage.objects;
create policy "delete event photo files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'event-photos' and public.can_add_event_photos(public.sheet_event_id(name)));

revoke all on function public.can_add_event_photos(bigint) from anon, public;
grant execute on function public.can_add_event_photos(bigint) to authenticated;

drop trigger if exists trg_log_activity on public.event_photos;
create trigger trg_log_activity
  after insert or update or delete on public.event_photos
  for each row execute function public.log_activity();

commit;

-- =====================================================================
-- Verify (run after commit). Expect 3 table policies and 3 storage ones.
--
-- select policyname, cmd from pg_policies
--  where tablename = 'event_photos' or policyname like '%event photo files%';
-- =====================================================================
