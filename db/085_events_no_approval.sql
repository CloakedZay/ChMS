-- =====================================================================
-- 085 — Events have no approval step: Upcoming → Done, or Cancelled
--
-- Run in Supabase → SQL Editor, after 084. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- The Leaders and the Pastor plan events together, and only Leaders add
-- them (db/084), so Planning and Pending (waiting for approval) are gone.
-- The app now shows three statuses:
--      Upcoming   saved by a Leader; members see it at once
--                 (stored as 'approved', so nothing else has to change)
--      Done       its date has passed (complete_past_events, db/042)
--      Cancelled  as before (db/051)
--
-- 1. Events still in Planning or Pending with a date become Upcoming, or
--    Done if their date has passed. They never had attendance taken, so
--    they don't count as missed events (missed_event_streak, db/046).
--    Ones without a date stay as they are; they show as Upcoming with
--    "No date set", and become Upcoming for real once a Leader edits them
--    and adds a date.
-- 2. New events can't be saved as Planning or Pending any more.
-- =====================================================================

begin;

-- 1. Old drafts → Upcoming / Done. auth.uid() is null here, so the review
--    guard (db/050) lets this through.
update public.events
   set status = 'approved'
 where status in ('planning', 'pending')
   and date is not null;

update public.events
   set status = 'done'
 where status = 'approved'
   and date < public.ph_today();

-- 2. Only Upcoming, Done and Cancelled from now on. NOT VALID: undated old
--    drafts are left alone, but every new or changed row is checked.
alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('approved', 'done', 'cancelled')) not valid;

commit;

-- =====================================================================
-- Verify (run after commit). Expect only approved / done / cancelled,
-- plus any undated old drafts.
--
-- select status, count(*), count(*) filter (where date is null) as no_date
--   from public.events group by status order by status;
-- =====================================================================
