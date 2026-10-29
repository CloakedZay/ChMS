-- =====================================================================
-- 101 — Text members when an event is added or cancelled
--
-- Run in Supabase → SQL Editor, after 100. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Leaders (and the Pastor) can tick "Text members about this event" when
-- adding one (api/sms/event). Those texts are logged in sms_log (db/096)
-- under a new kind, 'event_new', so each member gets it once — separate
-- from the day-before reminder ('event_reminder'). Cancelling an upcoming
-- event can text them too ('event_cancelled'). Safe to run again.
-- =====================================================================

begin;

alter table public.sms_log drop constraint if exists sms_log_kind_check;
alter table public.sms_log
  add constraint sms_log_kind_check check (kind in ('announcement', 'event_reminder', 'event_new', 'event_cancelled'));

commit;

-- =====================================================================
-- Verify (run after commit). Expect the rule to list 'event_new' and 'event_cancelled'.
--
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'sms_log_kind_check';
-- =====================================================================
