-- =====================================================================
-- 100 — SMS log: announcement ids are uuids
--
-- Run in Supabase → SQL Editor, after 099. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- sms_log.ref_id (db/096) was a number, which fits event ids but not
-- announcement ids (uuid), so announcement texts could not be logged and
-- were never sent. It becomes text; the "once per member" rule stays.
-- =====================================================================

begin;

alter table public.sms_log
  alter column ref_id type text using ref_id::text;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 'text'.
--
-- select data_type from information_schema.columns
--  where table_name = 'sms_log' and column_name = 'ref_id';
-- =====================================================================
