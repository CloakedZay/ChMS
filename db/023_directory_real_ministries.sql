-- =====================================================================
-- 023 — Member directory shows real ministries (step M2)
--
-- Run in Supabase → SQL Editor. Wrapped in a transaction.
--
-- member_directory (db/006) showed the old typed-in members.ministry.
-- Now its "ministry" column lists the member's real ministries from
-- ministry_assignments (active ministries, "A, B" in name order), so the
-- member directory, Dashboard and Reports use the real data without
-- changing their queries. Same columns, same branch scoping as before.
-- members.ministry (the old text) is kept but no longer shown.
-- =====================================================================

begin;

create or replace view public.member_directory as
select
  m.id,
  m.full_name,
  m.role,
  (select string_agg(mi.name, ', ' order by mi.name)
     from public.ministry_assignments a
     join public.ministries mi on mi.id = a.ministry_id
    where a.member_id = m.id and mi.is_active) as ministry,
  m.status,
  m.church_id
from public.members m
where m.status is distinct from 'archived'
  and (
    public.get_my_role() in ('admin', 'pastor')
    or m.church_id = public.get_my_church_id()
  );

revoke all on public.member_directory from anon, public;
grant select on public.member_directory to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). The view itself returns nothing in the SQL
-- Editor (no signed-in user), so this checks its definition and shows
-- what it will list. Expect 'uses assignments' = true, then members with
-- their real ministries (Youth members → Youth Ministry).
--
-- select 'uses assignments' as full_name,
--        (pg_get_viewdef('public.member_directory') like '%ministry_assignments%')::text as ministry
-- union all
-- select m.full_name,
--        coalesce((select string_agg(mi.name, ', ' order by mi.name)
--                    from public.ministry_assignments a join public.ministries mi on mi.id = a.ministry_id
--                   where a.member_id = m.id and mi.is_active), '(none)')
-- from public.members m
-- where m.status is distinct from 'archived';
-- =====================================================================
