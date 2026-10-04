-- =====================================================================
-- 012 — Module tracking: who opened which module / downloaded handouts
--
-- Run in Supabase → SQL Editor, after 011. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Adds public.module_views. The member pages add a row when a member
-- opens a module or downloads one of its handouts. Together with
-- discipleship_progress (answers) this gives the Training page's
-- "Member Progress" tab.
--
--   everyone      → add only their own rows; the database fills in who,
--                   church and time
--   member        → read their own
--   leader        → read their own church
--   admin, pastor → read all
--   nobody        → edits or deletes rows
-- =====================================================================

begin;

create table if not exists public.module_views (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  member_id  uuid not null default auth.uid(),
  church_id  uuid,
  module_id  bigint not null references public.discipleship_modules (id) on delete cascade,
  kind       text not null default 'opened' check (kind in ('opened', 'handout'))
);

create index if not exists module_views_member_idx on public.module_views (member_id);
create index if not exists module_views_module_idx on public.module_views (module_id);

alter table public.module_views enable row level security;

-- The app only supplies module_id and kind.
create or replace function public.guard_module_view()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.member_id  := auth.uid();
    new.church_id  := public.get_my_church_id();
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_module_view on public.module_views;
create trigger trg_guard_module_view
  before insert on public.module_views
  for each row execute function public.guard_module_view();

drop policy if exists "add own module views" on public.module_views;
create policy "add own module views"
  on public.module_views for insert to authenticated
  with check (member_id = auth.uid());

drop policy if exists "read module views scoped" on public.module_views;
create policy "read module views scoped"
  on public.module_views for select to authenticated
  using (
    member_id = auth.uid()
    or public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() = 'leader' and church_id = public.get_my_church_id())
  );

commit;

-- =====================================================================
-- Verify (run after commit). Expect: 2 policies (INSERT, SELECT), the
-- trigger trg_guard_module_view (INSERT), and 'view rows' = 0.
--
-- select 'policy' as kind, policyname as name, cmd::text as info
-- from pg_policies where tablename = 'module_views'
-- union all
-- select 'trigger', trigger_name, event_manipulation
-- from information_schema.triggers where event_object_table = 'module_views'
-- union all
-- select 'zcount', 'view rows', count(*)::text from public.module_views
-- order by 1, 2;
-- =====================================================================
