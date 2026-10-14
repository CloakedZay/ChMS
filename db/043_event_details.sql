-- =====================================================================
-- 043 — Event details: start time and venue
--
-- Run in Supabase → SQL Editor, after 042. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- events.start_time  optional, e.g. 18:00 (Philippine time, no time zone)
-- events.venue       optional, e.g. "Main Sanctuary" or an address
--
-- Both are shown to members with the event. Who may set them is the same
-- as for the rest of the event (db/007, db/042): no new policies.
-- =====================================================================

begin;

alter table public.events
  add column if not exists start_time time,
  add column if not exists venue text check (venue is null or length(venue) <= 200);

commit;

-- =====================================================================
-- Verify (run after commit). Expect 2.
--
-- select count(*) as columns from information_schema.columns
--  where table_schema = 'public' and table_name = 'events'
--    and column_name in ('start_time', 'venue');
-- =====================================================================
