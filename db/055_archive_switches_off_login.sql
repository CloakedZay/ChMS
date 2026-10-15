-- =====================================================================
-- 055 — Archiving a member switches off their login
--
-- Run in Supabase → SQL Editor, after 054. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Archiving hid a member from every list, but their login kept working.
-- Now, when the Secretary or the Pastor archives a member whose linked
-- login is a Member login, that login is disabled (db/013) — the same as
-- the Admin disabling it on the Users page. Restoring the member switches
-- it back on, but only if archiving was what switched it off: a login the
-- Admin had already disabled stays disabled.
--
-- Staff logins (Pastor, Leader, Finance, Secretary, Admin) are never
-- switched off this way — that stays the Admin's decision on the Users
-- page. While archiving has a login switched off, that login can't be
-- unlinked from the record (it would stay off for good).
--
-- members.archive_disabled_login  true while archiving has the login off
-- =====================================================================

begin;

alter table public.members
  add column if not exists archive_disabled_login boolean not null default false;

-- ---------------------------------------------------------------------
-- Profiles guard: same as db/016, plus the archive trigger below may
-- change "disabled" (it sets faithsync.member_archive for its own update).
-- ---------------------------------------------------------------------
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from 'leader' then
    new.is_elder := false;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if coalesce(current_setting('faithsync.member_archive', true), '') = 'on'
     and new.role is not distinct from old.role
     and new.church_id is not distinct from old.church_id
     and new.is_elder is not distinct from old.is_elder then
    return new;
  end if;

  if (new.role is distinct from old.role
      or new.church_id is distinct from old.church_id
      or new.disabled is distinct from old.disabled
      or new.is_elder is distinct from old.is_elder)
     and coalesce(public.get_my_role(), '') <> 'admin' then
    raise exception 'Only an admin can change a user''s role, church, access or Elder status';
  end if;

  if new.role is distinct from old.role and old.id = auth.uid() then
    raise exception 'You can''t change your own level. Ask another admin.';
  end if;

  if new.disabled is distinct from old.disabled and old.id = auth.uid() then
    raise exception 'You can''t disable your own login. Ask another admin.';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Pastor may still only change status (db/006); the flag below is set by
-- the archive trigger, not by the Pastor.
-- ---------------------------------------------------------------------
create or replace function public.restrict_pastor_member_edits()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.get_my_role() = 'pastor'
     and (to_jsonb(new) - 'status' - 'archive_disabled_login')
         is distinct from (to_jsonb(old) - 'status' - 'archive_disabled_login') then
    raise exception 'Pastors can only archive or restore members; ask the Secretary to edit details';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Archive / restore → login off / on
-- ---------------------------------------------------------------------
create or replace function public.sync_member_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  login profiles%rowtype;
begin
  if old.archive_disabled_login and new.profile_id is distinct from old.profile_id then
    raise exception 'Restore this member before unlinking their login';
  end if;

  -- Archived → switch a Member login off.
  if new.status = 'archived' and old.status is distinct from 'archived' and new.profile_id is not null then
    select * into login from profiles where id = new.profile_id;
    if found and login.role = 'member' and not login.disabled then
      if login.id = auth.uid() then
        raise exception 'You can''t archive your own member record';
      end if;
      perform set_config('faithsync.member_archive', 'on', true);
      update profiles set disabled = true where id = login.id;
      perform set_config('faithsync.member_archive', 'off', true);
      new.archive_disabled_login := true;
    end if;
  end if;

  -- Restored → switch it back on, if archiving switched it off.
  if old.status = 'archived' and new.status is distinct from 'archived' and old.archive_disabled_login then
    perform set_config('faithsync.member_archive', 'on', true);
    update profiles set disabled = false where id = old.profile_id;
    perform set_config('faithsync.member_archive', 'off', true);
    new.archive_disabled_login := false;
  end if;

  return new;
end;
$$;

-- Named to run after trg_restrict_pastor_member_edits (triggers run in
-- name order).
drop trigger if exists trg_sync_member_login on public.members;
create trigger trg_sync_member_login
  before update on public.members
  for each row execute function public.sync_member_login();

commit;

-- =====================================================================
-- Verify (run after commit). Expect 'flag column' = 1, 'sync trigger' = 1,
-- 'guard knows archive' = true.
--
-- select 'flag column' as check_name, count(*)::text as result
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'members' and column_name = 'archive_disabled_login'
-- union all
-- select 'sync trigger', count(*)::text from information_schema.triggers where trigger_name = 'trg_sync_member_login'
-- union all
-- select 'guard knows archive', (prosrc like '%member_archive%')::text
-- from pg_proc where proname = 'protect_profile_privileges';
-- =====================================================================
