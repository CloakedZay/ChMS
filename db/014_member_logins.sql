-- =====================================================================
-- 014 — Member logins (step E1): link member records to logins
--
-- Run in Supabase → SQL Editor, after 013. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- members.email       optional email typed by the Secretary; used as the
--                     login name when the Secretary creates a login
-- members.profile_id  the login this member record belongs to; a login
--                     can belong to only one member record
-- profiles.must_change_password
--                     set when the Secretary creates a login with a
--                     temporary password; the app makes the member pick
--                     their own password on first login, then clears it
--
-- Who can change them: the existing members rules already allow only the
-- Secretary to edit member records (the Pastor's trigger blocks every
-- column but status), and a user may update their own profile, which is
-- how they clear must_change_password.
-- =====================================================================

begin;

alter table public.members
  add column if not exists email text,
  add column if not exists profile_id uuid references public.profiles (id) on delete set null;

create unique index if not exists members_profile_id_key
  on public.members (profile_id) where profile_id is not null;

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

commit;

-- =====================================================================
-- Verify (run after commit). Expect the three new columns, the unique
-- index, and one or more 'signup' rows showing the function that makes
-- a profile when someone signs up (I need to see what it fills in).
--
-- select 'column' as kind, table_name || '.' || column_name as name, data_type as info
-- from information_schema.columns
-- where table_schema = 'public'
--   and ((table_name = 'members'  and column_name in ('email', 'profile_id'))
--     or (table_name = 'profiles' and column_name = 'must_change_password'))
-- union all
-- select 'index', indexname, indexdef from pg_indexes where indexname = 'members_profile_id_key'
-- union all
-- select 'signup', p.proname, p.prosrc
-- from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid
-- where tg.tgrelid = 'auth.users'::regclass and not tg.tgisinternal
-- order by 1, 2;
-- =====================================================================
