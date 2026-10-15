-- =====================================================================
-- 062 — The Pastor can add and edit members too
--
-- Run in Supabase → SQL Editor, after 061. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Only the Secretary could add a member or change their details; the
-- Pastor could only archive and restore (db/006). A branch without a
-- Secretary (or while they're away) had nobody to add a new member or
-- fix a phone number. Now the Pastor can do it for any branch:
--
--   add      Secretary (own branch) · Pastor (any branch, chosen on the form)
--   edit     Secretary (own branch) · Pastor (any branch)
--
-- The Pastor's "status only" check (restrict_pastor_member_edits, db/006,
-- db/055, db/056) is removed. Creating a login for a member is opened to
-- the Pastor in the app (api/members/create-login).
-- =====================================================================

begin;

drop policy if exists "insert members scoped" on public.members;
create policy "insert members scoped"
  on public.members for insert to authenticated
  with check (
    (public.get_my_role() = 'secretary' and church_id = public.get_my_church_id())
    or (public.get_my_role() = 'pastor' and church_id is not null)
  );

drop trigger if exists trg_restrict_pastor_member_edits on public.members;
drop function if exists public.restrict_pastor_member_edits();

commit;

-- =====================================================================
-- Verify (run after commit). Expect 'pastor can add' = true and
-- 'status-only check gone' = 0.
--
-- select 'pastor can add' as check_name,
--        (with_check like '%pastor%')::text as result
-- from pg_policies where tablename = 'members' and policyname = 'insert members scoped'
-- union all
-- select 'status-only check gone', count(*)::text
-- from information_schema.triggers where trigger_name = 'trg_restrict_pastor_member_edits';
-- =====================================================================
