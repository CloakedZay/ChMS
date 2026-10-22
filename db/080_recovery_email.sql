-- =====================================================================
-- 080 — Recovery email and "Forgot password?"
--
-- Run in Supabase → SQL Editor, after 079. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Until now only the Admin could reset a forgotten password. Most member
-- logins are made-up usernames (…@members.faithsync.app) that can't get
-- email, so Supabase's own "reset password" email can't reach them. Now a
-- login can add a recovery email of its own (Password & Google page and
-- Profile), confirmed with a 6-digit code sent to it. "Forgot password?"
-- on the sign-in page then emails a reset link there.
--
--   recovery_emails      one row per login: the confirmed recovery email,
--                        plus a new email waiting for its code
--   password_reset_log   when reset links were sent (at most 3 an hour per
--                        login, so nobody can flood someone's inbox)
--   my_recovery_email()  the signed-in login's recovery email and any email
--                        still waiting for its code
--
-- Both tables are closed to the app: only the server routes
-- (api/recovery-email, api/auth/forgot-password) read and write them, with
-- the service-role key, after checking who is asking. The code itself is
-- stored scrambled (SHA-256), never as typed. Several logins may share one
-- recovery email (a family email), each confirmed separately.
-- =====================================================================

begin;

create table if not exists public.recovery_emails (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  email           text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  verified_at     timestamptz,
  pending_email   text check (pending_email is null or pending_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  code_hash       text,
  code_expires_at timestamptz,
  code_sent_at    timestamptz,
  code_attempts   integer not null default 0
);

create index if not exists recovery_emails_email_idx
  on public.recovery_emails (lower(email)) where email is not null;

create table if not exists public.password_reset_log (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now()
);

create index if not exists password_reset_log_user_idx
  on public.password_reset_log (user_id, sent_at desc);

alter table public.recovery_emails    enable row level security;
alter table public.password_reset_log enable row level security;
revoke all on public.recovery_emails, public.password_reset_log from anon, authenticated, public;

create or replace function public.my_recovery_email()
returns table (email text, pending_email text)
language sql
stable
security definer
set search_path = public
as $$
  select r.email, r.pending_email
  from recovery_emails r
  where r.user_id = auth.uid();
$$;

revoke all on function public.my_recovery_email() from anon, public;
grant execute on function public.my_recovery_email() to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect tables = 2 and functions = 1.
--
-- select count(*) as tables from pg_tables
--  where schemaname = 'public' and tablename in ('recovery_emails', 'password_reset_log');
-- select count(*) as functions from pg_proc
--  where pronamespace = 'public'::regnamespace and proname = 'my_recovery_email';
-- =====================================================================
