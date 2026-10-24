-- =====================================================================
-- 084 — The Secretary no longer adds events
--
-- Run in Supabase → SQL Editor, after 083. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- The Leaders and the Pastor plan events together, so a Secretary's event
-- needing a Leader's approval (db/050) was an extra step. Now only Leaders
-- add events (approved on save, as before); the Secretary only views them,
-- like the Pastor. Taking attendance is unchanged: still the Secretary.
--
-- Events the Secretary already filed stay. A Leader of that branch can
-- still approve, send back, edit or delete them ("leader manage events");
-- in a branch with no Leader, the Pastor still approves or sends back the
-- pending ones (db/066).
-- =====================================================================

begin;

drop policy if exists "secretary create events"     on public.events;
drop policy if exists "secretary edit own events"   on public.events;
drop policy if exists "secretary delete own events" on public.events;

commit;

-- =====================================================================
-- Verify (run after commit). Expect no rows.
--
-- select policyname from pg_policies
--  where schemaname = 'public' and tablename = 'events'
--    and policyname like 'secretary%';
-- =====================================================================
