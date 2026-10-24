-- =====================================================================
-- 087 — No more "Busy" member status
--
-- Run in Supabase → SQL Editor, after 086. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Members are Active or Inactive (or archived). "Busy" (away on purpose,
-- db/059) is removed from the app, so:
--
-- 1. Every Busy member becomes Active. From now on the nightly check
--    (db/056, db/072) treats them like everyone else: Inactive after 14
--    days with no sign-in or attendance, or after missing 3 events in a
--    row, and Active again when they come back.
-- 2. A member can't be saved as Busy any more. NOT VALID: only new and
--    changed rows are checked (there are none left after step 1 anyway).
--
-- The functions that skip 'busy' (db/058, db/059, db/075) are left as
-- they are; with no Busy members they simply never match.
-- =====================================================================

begin;

update public.members
   set status = 'active', status_auto = false
 where status = 'busy';

alter table public.members drop constraint if exists members_no_busy;
alter table public.members add constraint members_no_busy
  check (status is distinct from 'busy') not valid;

commit;

-- =====================================================================
-- Verify (run after commit). Expect busy = 0.
--
-- select count(*) as busy from public.members where status = 'busy';
-- =====================================================================
