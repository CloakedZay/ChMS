-- =====================================================================
-- 048 — Members no longer see other members' status
--
-- Run in Supabase → SQL Editor, after 047. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- member_directory (db/006, db/023) showed everyone in the branch with
-- their status — active / busy / inactive. "Inactive" is a pastoral note
-- for follow-up, not something the congregation should read about each
-- other. The member pages no longer show the directory; this makes sure a
-- Member can't read status from the database either. For them the column
-- is empty. Staff (every level except Member) see it as before.
--
-- Same rows and columns as db/023 otherwise.
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
  case when coalesce(public.get_my_role(), 'member') <> 'member' then m.status end as status,
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
-- Verify (run after commit). Expect true.
--
-- select pg_get_viewdef('public.member_directory') like '%<> ''member''%' as status_hidden;
-- =====================================================================
