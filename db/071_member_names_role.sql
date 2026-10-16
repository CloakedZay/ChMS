-- =====================================================================
-- 071 — The Admin sees the Role written on a member record
--
-- Run in Supabase → SQL Editor, after 070. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- When the Secretary adds a member as, say, Leader and then presses
-- Create login, the login is made at the Member level: only the Admin may
-- give a staff level (db/004). The Users page now shows the Admin
-- "Record says: Leader" next to that login, with a button to set it.
-- For that, member_names (db/063, names only for the Admin) also returns
-- the record's role. A role is not private (no phone, email or birthday).
-- The new column goes last, so the pages reading the view keep working.
-- =====================================================================

begin;

create or replace view public.member_names as
select m.id, m.full_name, m.profile_id, m.status, m.church_id, m.role
from public.members m
where public.get_my_role() in ('admin', 'pastor')
   or (public.get_my_role() in ('leader', 'secretary') and m.church_id = public.get_my_church_id());

revoke all on public.member_names from anon, public;
grant select on public.member_names to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect one row: role.
--
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'member_names' and column_name = 'role';
-- =====================================================================
