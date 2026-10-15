-- =====================================================================
-- 064 — Only the Pastor deletes Bible verses
--
-- Run in Supabase → SQL Editor, after 063. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- The Verse of the Day list is one list for every branch, but any Leader
-- could delete verses from it, or clear it all (db/007). Now the Pastor
-- alone deletes; the Pastor and Leaders still add verses.
-- =====================================================================

begin;

drop policy if exists "pastor leader delete verses" on public.bible_verses;
drop policy if exists "pastor deletes verses" on public.bible_verses;
create policy "pastor deletes verses"
  on public.bible_verses for delete to authenticated
  using (public.get_my_role() = 'pastor');

commit;

-- =====================================================================
-- Verify (run after commit). Expect one row: 'pastor deletes verses'.
--
-- select policyname from pg_policies where tablename = 'bible_verses' and cmd = 'DELETE';
-- =====================================================================
