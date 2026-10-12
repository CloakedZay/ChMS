-- =====================================================================
-- 027 — Devotional journal
--
-- Run in Supabase → SQL Editor. Wrapped in a transaction.
--
-- A personal journal for every signed-in person (members and staff).
-- It is PRIVATE: each person can read, add, change and delete only their
-- own entries. Nobody else — not Admin, Pastor or Leader — can read them.
-- =====================================================================

begin;

create table if not exists public.devotional_journal (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_date  date not null default ((now() at time zone 'Asia/Manila')::date),
  scripture   text,                 -- e.g. "John 3:16-21"
  title       text,
  reflection  text,                 -- what stood out / what God is saying
  prayer      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint devotional_not_empty check (
    coalesce(nullif(trim(title), ''), nullif(trim(scripture), ''),
             nullif(trim(reflection), ''), nullif(trim(prayer), '')) is not null
  )
);

create index if not exists devotional_journal_user_date_idx
  on public.devotional_journal (user_id, entry_date desc, created_at desc);

create or replace function public.touch_devotional_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_devotional on public.devotional_journal;
create trigger trg_touch_devotional
  before update on public.devotional_journal
  for each row execute function public.touch_devotional_updated_at();

alter table public.devotional_journal enable row level security;

drop policy if exists "journal read own"   on public.devotional_journal;
drop policy if exists "journal insert own" on public.devotional_journal;
drop policy if exists "journal update own" on public.devotional_journal;
drop policy if exists "journal delete own" on public.devotional_journal;

create policy "journal read own"
  on public.devotional_journal for select to authenticated
  using (user_id = auth.uid());

create policy "journal insert own"
  on public.devotional_journal for insert to authenticated
  with check (user_id = auth.uid());

create policy "journal update own"
  on public.devotional_journal for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "journal delete own"
  on public.devotional_journal for delete to authenticated
  using (user_id = auth.uid());

revoke all on public.devotional_journal from anon, public;
grant select, insert, update, delete on public.devotional_journal to authenticated;

commit;
