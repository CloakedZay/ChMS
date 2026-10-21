-- =====================================================================
-- 076 — Date joined, and new members per month for Reports
--
-- Run in Supabase → SQL Editor, after 075. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Reports had no way to say how many people joined each month: a member
-- record only knew when it was typed in (created_at), and members added
-- from an Excel import all share the import day.
--
-- 1. members.joined_on — the day someone became a member. Existing
--    members start with the day their record was made (Philippine date);
--    the Secretary / Pastor can correct it on the Members page. New
--    members default to today.
-- 2. member_join_trend(p_months) — members who joined in each of the last
--    p_months months (this month included, oldest first; months with
--    nobody are 0). Archived members still count in the month they
--    joined. Scope, like the member directory: Admin and Pastor every
--    branch; Leader, Secretary and Finance their own branch; Members
--    nothing.
-- =====================================================================

begin;

alter table public.members
  add column if not exists joined_on date;

update public.members
   set joined_on = (created_at at time zone 'Asia/Manila')::date
 where joined_on is null;

alter table public.members
  alter column joined_on set default ((now() at time zone 'Asia/Manila')::date);

create index if not exists members_joined_on_idx on public.members (joined_on);

create or replace function public.member_join_trend(p_months integer default 12)
returns table (month date, joined integer)
language sql
stable
security definer
set search_path = public
as $$
  with months as (
    select generate_series(
             date_trunc('month', public.ph_today())
               - make_interval(months => greatest(least(p_months, 36), 1) - 1),
             date_trunc('month', public.ph_today()),
             interval '1 month'
           )::date as month
  )
  select
    mo.month,
    (select count(*)::int
       from members m
      where m.joined_on >= mo.month
        and m.joined_on <  (mo.month + interval '1 month')::date
        and (
          public.get_my_role() in ('admin', 'pastor')
          or (public.get_my_role() in ('leader', 'secretary', 'finance')
              and m.church_id = public.get_my_church_id())
        ))
  from months mo
  where public.get_my_role() in ('admin', 'pastor', 'leader', 'secretary', 'finance')
  order by mo.month;
$$;

revoke all on function public.member_join_trend(integer) from anon, public;
grant execute on function public.member_join_trend(integer) to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect no_date = 0 and 12 rows from the
-- function (run it signed in, from the app — in the SQL Editor there is
-- no signed-in user, so it returns nothing).
--
-- select count(*) as no_date from public.members where joined_on is null;
-- =====================================================================
