-- =====================================================================
-- 063 — The Admin sees member names only, not their details
--
-- Run in Supabase → SQL Editor, after 062. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- The Admin has no access to member records (roles doc, Staff Guide), and
-- the app never showed them, but the database still let an Admin read
-- every member's phone, email and birthday (db/006). The Users, Ministries
-- and Training pages need only names, so:
--
--   member_names (view)  id, full_name, profile_id, status, church_id —
--                        Admin and Pastor: all; Leader, Secretary: own
--                        branch. Those pages read this instead.
--   members              Admin removed: Pastor all; Leader, Secretary own
--                        branch (unchanged for them).
--   activity_log         member phone, email and birthday changes show
--                        "(hidden)" instead of the old and new values.
-- =====================================================================

begin;

-- Runs as its owner (like member_directory, db/006), so it can show these
-- columns to the Admin; the WHERE does the scoping.
create or replace view public.member_names as
select m.id, m.full_name, m.profile_id, m.status, m.church_id
from public.members m
where public.get_my_role() in ('admin', 'pastor')
   or (public.get_my_role() in ('leader', 'secretary') and m.church_id = public.get_my_church_id());

revoke all on public.member_names from anon, public;
grant select on public.member_names to authenticated;

-- ---------------------------------------------------------------------
-- The change log (db/010) kept old and new values, so the Admin could
-- read "phone: 0917… → 0918…". For members, phone, email and birthday
-- now show only that they changed — new entries and old ones.
-- ---------------------------------------------------------------------
create or replace function public.mask_private_changes(changes jsonb)
returns jsonb
language sql
immutable
as $$
  select case when changes is null or jsonb_typeof(changes) <> 'object' then changes else (
    select coalesce(jsonb_object_agg(k, case when k in ('phone', 'email', 'birth_date')
                                             then '{"from": "(hidden)", "to": "(hidden)"}'::jsonb
                                             else v end), '{}'::jsonb)
    from jsonb_each(changes) as e(k, v)
  ) end;
$$;

create or replace function public.activity_log_hide_private()
returns trigger
language plpgsql
as $$
begin
  if new.table_name = 'members' then
    new.changes := public.mask_private_changes(new.changes);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activity_log_hide_private on public.activity_log;
create trigger trg_activity_log_hide_private
  before insert on public.activity_log
  for each row execute function public.activity_log_hide_private();

update public.activity_log
   set changes = public.mask_private_changes(changes)
 where table_name = 'members'
   and changes ?| array['phone', 'email', 'birth_date'];

-- ---------------------------------------------------------------------
-- Members: Admin removed
-- ---------------------------------------------------------------------
drop policy if exists "view members scoped" on public.members;
create policy "view members scoped"
  on public.members for select to authenticated
  using (
    public.get_my_role() = 'pastor'
    or (public.get_my_role() in ('leader', 'secretary') and church_id = public.get_my_church_id())
  );

commit;

-- =====================================================================
-- Verify (run after commit). Expect 'admin reads members' = false,
-- 'member_names' = 1 and 'log entries with details' = 0.
--
-- select 'admin reads members' as check_name, (qual like '%admin%')::text as result
-- from pg_policies where tablename = 'members' and policyname = 'view members scoped'
-- union all
-- select 'member_names', count(*)::text from information_schema.views
-- where table_schema = 'public' and table_name = 'member_names'
-- union all
-- select 'log entries with details', count(*)::text from public.activity_log
-- where table_name = 'members' and changes -> 'phone' ->> 'from' is distinct from '(hidden)'
--   and changes ? 'phone';
-- =====================================================================
