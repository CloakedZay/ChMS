-- =====================================================================
-- 083 — New members per month, for one branch
--
-- Run in Supabase → SQL Editor, after 082. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Reports now has a branch picker for the Admin and Pastor. Every section
-- filters by branch in the app except "New members per month", which comes
-- from member_join_trend() (db/076). It gets an optional p_church: null =
-- every branch the caller can see (as before), a branch id = only that one.
-- Who sees what is unchanged: Admin and Pastor every branch; Leader,
-- Secretary and Finance their own branch only, whatever p_church says;
-- Members nothing.
-- =====================================================================

begin;

drop function if exists public.member_join_trend(integer);

create or replace function public.member_join_trend(p_months integer default 12, p_church uuid default null)
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
        and (p_church is null or m.church_id = p_church)
        and (
          public.get_my_role() in ('admin', 'pastor')
          or (public.get_my_role() in ('leader', 'secretary', 'finance')
              and m.church_id = public.get_my_church_id())
        ))
  from months mo
  where public.get_my_role() in ('admin', 'pastor', 'leader', 'secretary', 'finance')
  order by mo.month;
$$;

revoke all on function public.member_join_trend(integer, uuid) from anon, public;
grant execute on function public.member_join_trend(integer, uuid) to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect functions = 1 (only the new one).
--
-- select count(*) as functions from pg_proc
--  where pronamespace = 'public'::regnamespace and proname = 'member_join_trend';
-- =====================================================================
