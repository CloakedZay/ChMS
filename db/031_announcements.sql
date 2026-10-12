-- =====================================================================
-- 031 — Announcements
--
-- Run in Supabase → SQL Editor. Wrapped in a transaction.
--
-- Until now the "Announcements" box on the member overview just listed
-- approved events. This adds real announcements that staff write.
--
--   church_id   the branch it is for; empty (null) = every branch
--   is_pinned   pinned ones stay at the top
--   expires_on  optional; after this date it stops showing (staff who can
--               edit still see it, marked as expired)
--
-- Who sees / changes what (matches lib/permissions.js):
--   read    everyone signed in: announcements for all branches + their own
--           branch (Admin and Pastor: every branch). Expired ones only to
--           those who can edit them.
--   write   Pastor: any branch, or all branches
--           Leader: their own branch only
--   Nobody else writes (Admin, Finance, Secretary, Member read only).
-- =====================================================================

begin;

create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid references public.churches (id) on delete cascade,
  title       text not null check (char_length(trim(title)) between 1 and 120),
  body        text check (body is null or char_length(body) <= 4000),
  is_pinned   boolean not null default false,
  expires_on  date,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists announcements_list_idx
  on public.announcements (church_id, is_pinned desc, created_at desc);

create or replace function public.touch_announcement_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_announcement on public.announcements;
create trigger trg_touch_announcement
  before update on public.announcements
  for each row execute function public.touch_announcement_updated_at();

-- Can the signed-in person write announcements for this branch?
-- (null branch = all branches → Pastor only)
create or replace function public.can_edit_announcement(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.get_my_role() = 'pastor' then true
    when public.get_my_role() = 'leader' then cid is not null and cid = public.get_my_church_id()
    else false
  end;
$$;

alter table public.announcements enable row level security;

drop policy if exists "announcements read"   on public.announcements;
drop policy if exists "announcements insert" on public.announcements;
drop policy if exists "announcements update" on public.announcements;
drop policy if exists "announcements delete" on public.announcements;

create policy "announcements read"
  on public.announcements for select to authenticated
  using (
    public.get_my_role() is not null
    and (
      public.can_edit_announcement(church_id)
      or (
        (church_id is null
          or public.get_my_role() in ('admin', 'pastor')
          or church_id = public.get_my_church_id())
        and (expires_on is null or expires_on >= (now() at time zone 'Asia/Manila')::date)
      )
    )
  );

create policy "announcements insert"
  on public.announcements for insert to authenticated
  with check (public.can_edit_announcement(church_id) and created_by = auth.uid());

create policy "announcements update"
  on public.announcements for update to authenticated
  using (public.can_edit_announcement(church_id))
  with check (public.can_edit_announcement(church_id));

create policy "announcements delete"
  on public.announcements for delete to authenticated
  using (public.can_edit_announcement(church_id));

revoke all on public.announcements from anon, public;
grant select, insert, update, delete on public.announcements to authenticated;
revoke all on function public.can_edit_announcement(uuid) from anon, public;
grant execute on function public.can_edit_announcement(uuid) to authenticated;

commit;
