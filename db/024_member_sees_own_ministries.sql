-- =====================================================================
-- 024 — Members can see their own ministries (fix to 022)
--
-- Run in Supabase → SQL Editor, after 023. Wrapped in a transaction.
--
-- db/022 let a member read their own ministry assignments by checking
-- members.profile_id — but members can't read the members table (db/006),
-- so that check always failed and members saw none. A small SECURITY
-- DEFINER helper answers "is this member record mine?" without opening
-- the members table.
-- =====================================================================

begin;

create or replace function public.is_my_member_record(mid bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from members where id = mid and profile_id = auth.uid());
$$;

drop policy if exists "read ministry assignments" on public.ministry_assignments;
create policy "read ministry assignments"
  on public.ministry_assignments for select to authenticated
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('leader', 'secretary') and church_id = public.get_my_church_id())
    or public.is_my_member_record(member_id)
  );

commit;

-- =====================================================================
-- Verify (run after commit). Expect the rule to mention
-- is_my_member_record.
--
-- select policyname, qual from pg_policies
-- where tablename = 'ministry_assignments' and cmd = 'SELECT';
-- =====================================================================
