-- =====================================================================
-- 096 — Text message (SMS) notifications
--
-- Run in Supabase → SQL Editor, after 095. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- The app texts members through Twilio (lib/sms.ts; keys in the server's
-- environment, see docs/DEPLOYMENT.md):
--   * an announcement, when the Secretary ticks "Also send as text"
--     (api/sms/announcement)
--   * automatically, the day before each event (api/sms/event-reminders,
--     run every morning by the scheduler in vercel.json)
-- Only members with a mobile number (09XXXXXXXXX), not archived, and not
-- opted out get them.
--
-- 1. profiles.sms_opt_out — a member with a login can turn texts off on
--    their profile page.
-- 2. sms_log — one row per text sent (or failed), so the same thing is
--    never texted twice to the same member. Written by the server only;
--    the Secretary (own branch), Pastor and Admin can read it.
-- =====================================================================

begin;

alter table public.profiles
  add column if not exists sms_opt_out boolean not null default false;

create table if not exists public.sms_log (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind       text not null check (kind in ('announcement', 'event_reminder')),
  ref_id     bigint not null,
  member_id  bigint references public.members (id) on delete set null,
  church_id  uuid references public.churches (id) on delete cascade,
  phone      text not null,
  status     text not null check (status in ('sent', 'failed')),
  error      text,
  constraint sms_log_once unique (kind, ref_id, member_id)
);

alter table public.sms_log enable row level security;

drop policy if exists "read sms log" on public.sms_log;
create policy "read sms log"
  on public.sms_log for select to authenticated
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() = 'secretary' and church_id = public.get_my_church_id())
  );

revoke all on public.sms_log from anon, public;
grant select on public.sms_log to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 1 and 1.
--
-- select count(*) from information_schema.columns
--  where table_name = 'profiles' and column_name = 'sms_opt_out';
-- select count(*) from pg_policies where tablename = 'sms_log';
-- =====================================================================
