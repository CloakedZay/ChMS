-- =====================================================================
-- 081 — Pastor and Leader only view attendance
--
-- Run in Supabase → SQL Editor, after 080. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Until now (db/041, db/065) the Pastor (any branch) and Leaders (own
-- branch) could take attendance. Now only these take it, from the event's
-- date on, for approved or done events:
--   * Secretary            own branch
--   * attendance helpers   own branch (members the Pastor or Secretary
--                          picked — they still pick them)
-- The Pastor (all branches) and Leaders (own branch) still see every
-- attendance sheet, count, visitor list and sign-in photo, read-only, like
-- the Admin and Finance.
--
-- Only can_take_attendance changes; marking people, visitors and sheet
-- photos all check it (db/041, db/060), and the app shows "View
-- attendance" with the boxes locked to anyone it says no to.
-- =====================================================================

begin;

create or replace function public.can_take_attendance(p_event bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from events e
    where e.id = p_event
      and e.status in ('approved', 'done')
      and e.date <= public.ph_today()
      and e.church_id = public.get_my_church_id()
      and (
        public.get_my_role() = 'secretary'
        or public.is_attendance_helper()
      )
  );
$$;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 'pastor_or_leader_left' = false.
-- Then sign in as the Pastor or a Leader: Events → Attendance opens the
-- sheet with the boxes locked; as the Secretary they can still be ticked.
--
-- select pg_get_functiondef('public.can_take_attendance(bigint)'::regprocedure)
--        ~ '''(pastor|leader)''' as pastor_or_leader_left;
-- =====================================================================
