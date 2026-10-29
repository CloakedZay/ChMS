-- =====================================================================
-- 090 — Online meeting link on events
--
-- Run in Supabase → SQL Editor, after 089. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- events.meeting_link  optional https:// link for an online gathering
--                      (Zoom, Google Meet, or a generated Jitsi room).
--
-- Shown to members with the event. Who may set it is the same as for the
-- rest of the event: no new policies.
-- =====================================================================

begin;

alter table public.events
  add column if not exists meeting_link text
    check (meeting_link is null or (meeting_link ~ '^https://' and length(meeting_link) <= 500));

commit;

-- =====================================================================
-- Verify (run after commit). Expect 1.
--
-- select count(*) as columns from information_schema.columns
--  where table_schema = 'public' and table_name = 'events'
--    and column_name = 'meeting_link';
-- =====================================================================
