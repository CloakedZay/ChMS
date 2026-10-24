-- =====================================================================
-- 088 — Who manages which training modules
--
-- Run in Supabase → SQL Editor, after 087. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Until now (db/025) the Pastor could manage any module, and a Leader the
-- general ones plus those of a ministry they head. Now each module has
-- one owner:
--   General discipleship path (ministry_id null)  → the Pastor only
--   A ministry's modules                          → only the Leader who
--                                                    heads that ministry
--                                                    (ministries.leader_id)
-- "Manage" is everything can_edit_module_group / can_edit_module cover:
-- adding, editing, hiding and deleting modules, their questions, and their
-- handouts and handout files (db/025 policies). Reading is unchanged.
-- A ministry with no head has nobody to add its modules until the Pastor
-- picks a head on the Ministries page. Existing modules stay.
-- =====================================================================

begin;

create or replace function public.can_edit_module_group(min_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
           when min_id is null then public.get_my_role() = 'pastor'
           else public.get_my_role() = 'leader' and public.is_ministry_head(min_id)
         end;
$$;

commit;

-- =====================================================================
-- Verify (run after commit). Expect the function text to mention both
-- 'pastor' and 'is_ministry_head'.
--
-- select prosrc from pg_proc where proname = 'can_edit_module_group';
-- =====================================================================
