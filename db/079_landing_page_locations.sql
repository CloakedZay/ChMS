-- =====================================================================
-- 079 — Landing page lists the branches from the database
--
-- Run in Supabase → SQL Editor, after 078. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- The landing page had its three locations typed into the code, so a new
-- branch never showed up there. Now it reads them from churches.
--
-- 1. churches.is_main — marks the main church (shown first, as "Main
--    Church"; the rest are "Satellite"). Pandi is set as the main church.
-- 2. public_locations() — for the landing page, so it works for visitors
--    who aren't signed in. Gives only each branch's name, location, whether
--    it is the main church, and its member count rounded down to the
--    nearest 10 (archived members left out). Nothing else from churches or
--    members is opened to visitors: the tables' own rules don't change.
--
-- A new branch added to churches appears on the landing page right away.
-- =====================================================================

begin;

alter table public.churches
  add column if not exists is_main boolean not null default false;

update public.churches
   set is_main = true
 where name ilike '%pandi%'
   and not exists (select 1 from public.churches where is_main);

create or replace function public.public_locations()
returns table (
  name     text,
  location text,
  is_main  boolean,
  members  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.name,
    nullif(trim(c.location), ''),
    c.is_main,
    ((select count(*)
        from members m
       where m.church_id = c.id
         and m.status is distinct from 'archived') / 10 * 10)::int
  from churches c
  order by c.is_main desc, c.created_at, c.name;
$$;

revoke all on function public.public_locations() from public;
grant execute on function public.public_locations() to anon, authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect one row per branch, the main church
-- first, and main_churches = 1.
--
-- select * from public.public_locations();
-- select count(*) as main_churches from public.churches where is_main;
-- =====================================================================
