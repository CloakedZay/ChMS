-- =====================================================================
-- 099 — No more archived members
--
-- Run in Supabase → SQL Editor, after 098. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Archiving members was removed from the app (panel feedback, Oct 2026):
-- someone who stops coming turns Inactive by itself (db/056, db/072).
-- This brings back every member still archived. The existing triggers
-- decide the rest, as for a Restore on the Members page:
--   status       Active if seen lately and not missing events, otherwise
--                Inactive (automatic) — db/057, db/072
--   their login  switched back on if archiving had switched it off — db/055
-- Then a rule stops anything from archiving a member again.
-- =====================================================================

begin;

update public.members
   set status = 'active'
 where status = 'archived';

alter table public.members drop constraint if exists members_not_archived;
alter table public.members
  add constraint members_not_archived check (status is distinct from 'archived');

commit;

-- =====================================================================
-- Verify (run after commit). Expect 0.
--
-- select count(*) from public.members where status = 'archived';
-- =====================================================================
