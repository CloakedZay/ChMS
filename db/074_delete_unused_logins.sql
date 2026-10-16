-- =====================================================================
-- 074 — The Admin can delete a login that has no church records
--
-- Run in Supabase → SQL Editor, after 073. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- For logins made by mistake, duplicates and test accounts. People who
-- leave are still Disabled instead, so their history stays traceable.
--
-- login_church_records(login) lists what a login is recorded as having
-- done, with counts. The Delete login button (/api/users/delete) deletes
-- only when this list is empty; otherwise it tells the Admin what is in
-- the way and to disable the login instead.
--
-- Not counted (removed with the login, or kept without it): their own
-- journal, assistant chats, messages, group memberships, screen time and
-- module views; announcements and follow-up notes they wrote stay, with
-- the writer left blank (db/031, 032). Their member record stays, unlinked.
-- =====================================================================

begin;

create or replace function public.login_church_records(p_user uuid)
returns table (what text, how_many integer)
language sql
stable
security definer
set search_path = public
as $$
  select what, n from (
    select 'finance entries recorded'        as what, (select count(*)::int from transactions       where recorded_by = p_user) as n
    union all select 'events added',                  (select count(*)::int from events             where created_by = p_user)
    union all select 'events approved or reviewed',   (select count(*)::int from events             where approved_by = p_user or reviewed_by = p_user)
    union all select 'events cancelled',              (select count(*)::int from events             where cancelled_by = p_user)
    union all select 'ministries they head',          (select count(*)::int from ministries         where leader_id = p_user)
    union all select 'ministry assignments made',     (select count(*)::int from ministry_assignments where assigned_by = p_user)
    union all select 'assistant documents added',     (select count(*)::int from chatbot_documents  where created_by = p_user)
    union all select 'spending requests',             (select count(*)::int from expense_requests
                                                        where p_user in (requested_by, released_by, liquidation_submitted_by, liquidated_by))
    union all select 'spending approvals',            (select count(*)::int from expense_approvals  where approver_id = p_user)
    union all select 'receipts uploaded',             (select count(*)::int from expense_receipts   where uploaded_by = p_user)
    union all select 'training answers reviewed',     (select count(*)::int from discipleship_progress where reviewed_by = p_user::text)
    union all select 'handouts uploaded',             (select count(*)::int from module_handouts    where uploaded_by = p_user::text)
    union all select 'attendance marks',              (select count(*)::int from event_attendance   where marked_by = p_user)
                                                    + (select count(*)::int from event_visitors     where marked_by = p_user)
    union all select 'visitors added',                (select count(*)::int from visitors           where created_by = p_user)
    union all select 'sign-in sheet photos',          (select count(*)::int from event_sheet_photos where uploaded_by = p_user)
  ) r
  where n > 0;
$$;

-- Only the server (service key) and the Admin may ask.
revoke all on function public.login_church_records(uuid) from anon, public, authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect one row: login_church_records.
--
-- select routine_name from information_schema.routines
-- where routine_schema = 'public' and routine_name = 'login_church_records';
-- =====================================================================
