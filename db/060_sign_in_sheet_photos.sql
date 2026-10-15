-- =====================================================================
-- 060 — Photos of the paper sign-in sheet on an event
--
-- Run in Supabase → SQL Editor, after 059. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Whoever takes attendance (Pastor, Leaders, Secretary, attendance
-- helpers — can_take_attendance, db/041) can attach phone photos of the
-- paper sheet to the event, and remove them. Whoever can see the event's
-- attendance (those, plus Admin and Finance of the branch) can look at
-- them. Members never see them: the sheet has other people's names and
-- visitors' phone numbers.
--
-- Files live in a private storage bucket 'attendance-sheets', in a folder
-- named after the event number. Like visitors (db/041), the photos are
-- kept for 6 months after the event: purge_old_sheet_photos() removes
-- the list entries and returns the files for the app to delete; the
-- Attendance page runs it when opened.
-- =====================================================================

begin;

-- Event number from a storage path "123/abc-sheet.jpg"; null if the first
-- folder isn't a number (CASE makes the check run before the cast).
create or replace function public.sheet_event_id(path text)
returns bigint
language sql
immutable
as $$
  select case when split_part(path, '/', 1) ~ '^[0-9]{1,18}$'
              then split_part(path, '/', 1)::bigint end;
$$;

-- May the caller look at this event's attendance (and so its photos)?
create or replace function public.can_view_event_attendance(p_event bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_take_attendance(p_event)
      or exists (select 1 from events e where e.id = p_event and public.can_view_attendance(e.church_id));
$$;

-- ---------------------------------------------------------------------
-- The list of photos
-- ---------------------------------------------------------------------
create table if not exists public.event_sheet_photos (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  event_id      bigint not null references public.events (id) on delete cascade,
  file_path     text not null unique,
  file_name     text not null,
  file_size     bigint,
  uploaded_by   uuid not null default auth.uid(),
  uploader_name text
);

create index if not exists event_sheet_photos_event_idx on public.event_sheet_photos (event_id);

alter table public.event_sheet_photos enable row level security;

create or replace function public.guard_sheet_photo()
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

drop trigger if exists trg_guard_sheet_photo on public.event_sheet_photos;
create trigger trg_guard_sheet_photo
  before insert on public.event_sheet_photos
  for each row execute function public.guard_sheet_photo();

drop policy if exists "read sheet photos" on public.event_sheet_photos;
create policy "read sheet photos"
  on public.event_sheet_photos for select to authenticated
  using (public.can_view_event_attendance(event_id));

drop policy if exists "add sheet photos" on public.event_sheet_photos;
create policy "add sheet photos"
  on public.event_sheet_photos for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_take_attendance(event_id));

drop policy if exists "remove sheet photos" on public.event_sheet_photos;
create policy "remove sheet photos"
  on public.event_sheet_photos for delete to authenticated
  using (public.can_take_attendance(event_id));

revoke all on public.event_sheet_photos from anon, public;
grant select, insert, delete on public.event_sheet_photos to authenticated;

-- ---------------------------------------------------------------------
-- Private storage bucket for the photos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('attendance-sheets', 'attendance-sheets', false)
on conflict (id) do nothing;

drop policy if exists "read sheet photo files" on storage.objects;
create policy "read sheet photo files"
  on storage.objects for select to authenticated
  using (bucket_id = 'attendance-sheets' and public.can_view_event_attendance(public.sheet_event_id(name)));

drop policy if exists "upload sheet photo files" on storage.objects;
create policy "upload sheet photo files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'attendance-sheets' and public.can_take_attendance(public.sheet_event_id(name)));

drop policy if exists "delete sheet photo files" on storage.objects;
create policy "delete sheet photo files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'attendance-sheets' and public.can_take_attendance(public.sheet_event_id(name)));

-- ---------------------------------------------------------------------
-- Kept for 6 months after the event. Removes the caller's expired list
-- entries (events they take attendance for) and returns the files, which
-- the app then deletes from storage.
-- ---------------------------------------------------------------------
create or replace function public.purge_old_sheet_photos()
returns setof text
language sql
volatile
security definer
set search_path = public
as $$
  delete from event_sheet_photos p
   using events e
   where e.id = p.event_id
     and e.date < public.ph_today() - interval '6 months'
     and public.can_take_attendance(p.event_id)
  returning p.file_path;
$$;

revoke all on function public.sheet_event_id(text), public.can_view_event_attendance(bigint),
                       public.purge_old_sheet_photos() from anon, public;
grant execute on function public.sheet_event_id(text), public.can_view_event_attendance(bigint),
                          public.purge_old_sheet_photos() to authenticated;

-- ---------------------------------------------------------------------
-- Activity log (db/010): photo added / removed.
-- ---------------------------------------------------------------------
drop trigger if exists trg_log_activity on public.event_sheet_photos;
create trigger trg_log_activity
  after insert or update or delete on public.event_sheet_photos
  for each row execute function public.log_activity();

commit;

-- =====================================================================
-- Verify (run after commit). Expect: 'bucket' = private, 3 'storage
-- policy' rows, 3 'table policy' rows.
--
-- select 'bucket' as kind, id as name, case when public then 'PUBLIC' else 'private' end as info
-- from storage.buckets where id = 'attendance-sheets'
-- union all
-- select 'storage policy', policyname, cmd::text from pg_policies
-- where schemaname = 'storage' and policyname like '%sheet photo files%'
-- union all
-- select 'table policy', policyname, cmd::text from pg_policies where tablename = 'event_sheet_photos'
-- order by 1, 2;
-- =====================================================================
