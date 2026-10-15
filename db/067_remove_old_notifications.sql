-- =====================================================================
-- 067 — Remove the old notification feed and two unused tables
--
-- Run in Supabase → SQL Editor, after 066. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- These were made by hand in the Supabase dashboard before db/001 and
-- never written into a file (db/000 now records them):
--
--   notifications  An early feed. Four triggers wrote a notice whenever a
--                  member, event, transaction or training answer was
--                  added — without a branch. Its read rule let every
--                  logged-in user see every notice with no branch, so
--                  any level (Secretary, Admin, even a Member) in any
--                  branch could read "Income Recorded – Tithe – ₱5000" or
--                  a new member's name. Anyone could also insert a notice
--                  into everyone's bell, and mark notices read for
--                  everyone. The dashboard bell now shows only notices
--                  scoped by role and branch (follow-up, event approvals).
--   proposals      An early approval feature, replaced by spending
--                  requests (db/017); unused, and anyone could insert.
--   fund_categories
--                  An early list of funds; unused (the ledger keeps the
--                  fund as text). transactions.fund_id pointed to it.
--
-- Also removed: transactions.fund_id and transactions.member_id, two
-- unused links (the ledger uses the text columns fund and member).
-- =====================================================================

begin;

-- The four "notify on insert" triggers and their functions.
drop trigger if exists trg_member_added          on public.members;
drop trigger if exists trg_event_added           on public.events;
drop trigger if exists trg_transaction_added     on public.transactions;
drop trigger if exists trg_discipleship_submitted on public.discipleship_progress;

drop function if exists public.notify_on_member_insert();
drop function if exists public.notify_on_event_insert();
drop function if exists public.notify_on_transaction_insert();
drop function if exists public.notify_on_submission();

drop table if exists public.notifications;
drop table if exists public.proposals;

alter table public.transactions drop column if exists fund_id;
alter table public.transactions drop column if exists member_id;
drop table if exists public.fund_categories;

commit;

-- =====================================================================
-- Verify (run after commit). Expect all three = 0.
--
-- select
--   (select count(*) from pg_class where relname in ('notifications', 'proposals', 'fund_categories') and relkind = 'r') as old_tables,
--   (select count(*) from pg_proc where proname like 'notify_on_%') as old_functions,
--   (select count(*) from information_schema.columns
--     where table_name = 'transactions' and column_name in ('fund_id', 'member_id')) as old_columns;
-- =====================================================================
