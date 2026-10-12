-- =====================================================================
-- 011 — Screen time (part 6b): which pages people open, and for how long
--
-- Run in Supabase → SQL Editor, after 010. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Adds public.page_visits. The app adds a row when a page opens and
-- updates its seconds while the tab is visible. Everyone who logs in is
-- tracked (members too).
--
--   everyone      → add and update only their own visits, and only the
--                   seconds; the database fills in who / branch / level /
--                   start time, and seconds can't exceed the real time
--                   since the visit started
--   admin, pastor → read every visit (screen time on the Activity page)
--   nobody        → deletes visits
-- =====================================================================

begin;

create table if not exists public.page_visits (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid(),
  church_id  uuid,
  role       text,          -- their level at the time
  path       text not null,
  started_at timestamptz not null default now(),
  seconds    integer not null default 0 check (seconds >= 0)
);

create index if not exists page_visits_started_at_idx on public.page_visits (started_at desc);
create index if not exists page_visits_user_idx       on public.page_visits (user_id);

alter table public.page_visits enable row level security;

-- ---------------------------------------------------------------------
-- Guard: the app only supplies the page path (on add) and the seconds
-- (on update). Everything else comes from the database.
-- ---------------------------------------------------------------------
create or replace function public.guard_page_visit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.user_id    := auth.uid();
    new.church_id  := public.get_my_church_id();
    new.role       := public.get_my_role();
    new.started_at := now();
    new.seconds    := 0;
    new.path       := left(new.path, 200);
  else
    new.user_id    := old.user_id;
    new.church_id  := old.church_id;
    new.role       := old.role;
    new.path       := old.path;
    new.started_at := old.started_at;
    -- Never goes down, never more than the real time since it started.
    new.seconds := least(
      greatest(new.seconds, old.seconds),
      ceil(extract(epoch from now() - old.started_at))::integer
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_page_visit on public.page_visits;
create trigger trg_guard_page_visit
  before insert or update on public.page_visits
  for each row execute function public.guard_page_visit();

-- ---------------------------------------------------------------------
-- Rules. Updating needs the row to be readable, so people can read
-- their own visits; admin and pastor read all.
-- ---------------------------------------------------------------------
drop policy if exists "read own or all page visits" on public.page_visits;
create policy "read own or all page visits"
  on public.page_visits for select to authenticated
  using (user_id = auth.uid() or public.get_my_role() in ('admin', 'pastor'));

drop policy if exists "add own page visits" on public.page_visits;
create policy "add own page visits"
  on public.page_visits for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "update own page visits" on public.page_visits;
create policy "update own page visits"
  on public.page_visits for update to authenticated
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Totals for the Screen time tab. "security invoker" = runs as the
-- caller, so the read rule above still decides what they see.
-- ---------------------------------------------------------------------
create or replace function public.screen_time_by_user(from_ts timestamptz, to_ts timestamptz)
returns table (user_id uuid, visits bigint, seconds bigint, last_seen timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select v.user_id, count(*), coalesce(sum(v.seconds), 0), max(v.started_at)
  from public.page_visits v
  where v.started_at >= from_ts and v.started_at < to_ts
  group by v.user_id
  order by 3 desc;
$$;

create or replace function public.screen_time_by_page(for_user uuid, from_ts timestamptz, to_ts timestamptz)
returns table (path text, visits bigint, seconds bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select v.path, count(*), coalesce(sum(v.seconds), 0)
  from public.page_visits v
  where v.user_id = for_user and v.started_at >= from_ts and v.started_at < to_ts
  group by v.path
  order by 3 desc;
$$;

commit;

-- =====================================================================
-- Verify (run after commit). Expect: 3 policies, the trigger
-- trg_guard_page_visit (INSERT and UPDATE), the two functions, and
-- 'visit rows' = 0.
--
-- select 'policy' as kind, policyname as name, cmd::text as info
-- from pg_policies where tablename = 'page_visits'
-- union all
-- select 'trigger', trigger_name, string_agg(event_manipulation, ',')
-- from information_schema.triggers where event_object_table = 'page_visits' group by trigger_name
-- union all
-- select 'function', proname, 'ok' from pg_proc where proname in ('screen_time_by_user', 'screen_time_by_page')
-- union all
-- select 'zcount', 'visit rows', count(*)::text from public.page_visits
-- order by 1, 2;
-- =====================================================================
