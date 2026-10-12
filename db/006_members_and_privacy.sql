-- =====================================================================
-- 006 — Member records and profile privacy per the roles doc (step 4b)
--
-- members (full records, incl. phone)
--   read     Admin, Pastor: all · Leader, Secretary: own church
--            (was: every logged-in user, every church)
--   add      Secretary, own church            (was: Admin, Pastor, Secretary)
--   edit     Secretary, own church; Pastor may only archive / restore
--   delete   nobody — archive instead (status 'archived')
--
-- member_directory (new view: name, church role, ministry, status — no
-- phone, no archived members) — every logged-in user, own church;
-- Admin and Pastor see every church. Used by member pages, dashboards
-- and reports.
--
-- profiles (logins) — read own; Admin, Pastor: all; Leader, Secretary:
-- own church (was: every logged-in user saw every login's email).
--
-- members.phone becomes text so a leading 0 is kept.
--
-- RUN ONLY AFTER the app code from the same commit is running: the old
-- member pages read the members table directly and would show nothing
-- to members once this is applied.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Helper functions: pin search_path (they run as owner). No behaviour
-- change.
-- ---------------------------------------------------------------------
alter function public.get_my_role()      set search_path = public;
alter function public.get_my_church_id() set search_path = public;

-- ---------------------------------------------------------------------
-- members
-- ---------------------------------------------------------------------
drop policy if exists "Members can view members"    on public.members;
drop policy if exists "delete members admin only"   on public.members;

drop policy if exists "view members scoped" on public.members;
create policy "view members scoped"
  on public.members for select to authenticated
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('leader', 'secretary') and church_id = public.get_my_church_id())
  );

drop policy if exists "insert members scoped" on public.members;
create policy "insert members scoped"
  on public.members for insert to authenticated
  with check (public.get_my_role() = 'secretary' and church_id = public.get_my_church_id());

drop policy if exists "update members scoped" on public.members;
create policy "update members scoped"
  on public.members for update to authenticated
  using (
    public.get_my_role() = 'pastor'
    or (public.get_my_role() = 'secretary' and church_id = public.get_my_church_id())
  )
  with check (
    public.get_my_role() = 'pastor'
    or (public.get_my_role() = 'secretary' and church_id = public.get_my_church_id())
  );

-- No delete policy on purpose: members are archived, never deleted.

-- Pastor may change status (archive / restore) and nothing else.
create or replace function public.restrict_pastor_member_edits()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.get_my_role() = 'pastor'
     and (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'Pastors can only archive or restore members; ask the Secretary to edit details';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restrict_pastor_member_edits on public.members;
create trigger trg_restrict_pastor_member_edits
  before update on public.members
  for each row execute function public.restrict_pastor_member_edits();

-- Keep leading zeros (0917…). Numbers already saved have lost theirs.
alter table public.members alter column phone type text using phone::text;

-- ---------------------------------------------------------------------
-- member_directory — runs as its owner, so it can show the safe columns
-- to people who can't read the members table; the WHERE does the
-- church scoping instead of RLS.
-- ---------------------------------------------------------------------
create or replace view public.member_directory as
select id, full_name, role, ministry, status, church_id
from public.members
where status is distinct from 'archived'
  and (
    public.get_my_role() in ('admin', 'pastor')
    or church_id = public.get_my_church_id()
  );

revoke all on public.member_directory from anon, public;
grant select on public.member_directory to authenticated;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
drop policy if exists "Authenticated users can read all profiles" on public.profiles;

drop policy if exists "staff read profiles scoped" on public.profiles;
create policy "staff read profiles scoped"
  on public.profiles for select to authenticated
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('leader', 'secretary') and church_id = public.get_my_church_id())
  );
-- "Users can read own profile" stays: everyone still reads their own row.

commit;

-- =====================================================================
-- Verify (run after commit)
-- =====================================================================
-- 1. Policies — members: view, insert, update (no delete, no "Members can
--    view members"); profiles: own read, staff read, own update:
-- select tablename, policyname, cmd
-- from pg_policies
-- where schemaname = 'public' and tablename in ('members', 'profiles')
-- order by tablename, cmd, policyname;
--
-- 2. Phone is text now:
-- select data_type from information_schema.columns
-- where table_name = 'members' and column_name = 'phone';
-- =====================================================================
