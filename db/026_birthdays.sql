-- =====================================================================
-- 026 — Member birthdays and the "upcoming birthdays" widget
--
-- Run in Supabase → SQL Editor. Wrapped in a transaction: if any line
-- fails, nothing is applied.
--
-- 1. members.birth_date — optional. Who can set it is unchanged: the
--    Secretary adds / edits members (db/006). Only the Secretary and the
--    people who can already read the members table can see the full date.
-- 2. upcoming_birthdays (new view) — name, month, day and days until the
--    next birthday. NO birth year, so nobody's age is exposed. Same
--    scoping as member_directory: own church; Admin and Pastor see every
--    church. Archived members are left out. Uses Philippine time so a
--    birthday changes over at local midnight.
-- =====================================================================

begin;

alter table public.members
  add column if not exists birth_date date;

create or replace view public.upcoming_birthdays as
select
  m.id,
  m.full_name,
  m.church_id,
  extract(month from m.birth_date)::int as birth_month,
  extract(day   from m.birth_date)::int as birth_day,
  (n.next_birthday - n.today)           as days_until
from public.members m
cross join lateral (
  select
    (now() at time zone 'Asia/Manila')::date as today,
    case
      when (m.birth_date + make_interval(years => date_part('year', age((now() at time zone 'Asia/Manila')::date, m.birth_date))::int))::date
           < (now() at time zone 'Asia/Manila')::date
      then (m.birth_date + make_interval(years => date_part('year', age((now() at time zone 'Asia/Manila')::date, m.birth_date))::int + 1))::date
      else (m.birth_date + make_interval(years => date_part('year', age((now() at time zone 'Asia/Manila')::date, m.birth_date))::int))::date
    end as next_birthday
) n
where m.birth_date is not null
  and m.status is distinct from 'archived'
  and (
    public.get_my_role() in ('admin', 'pastor')
    or m.church_id = public.get_my_church_id()
  );

revoke all on public.upcoming_birthdays from anon, public;
grant select on public.upcoming_birthdays to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit; as the SQL Editor user the view returns
-- nothing, so test from the app):
-- select column_name from information_schema.columns
-- where table_name = 'members' and column_name = 'birth_date';
-- =====================================================================
