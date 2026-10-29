-- =====================================================================
-- 091 — Only the Secretary posts announcements
--
-- Run in Supabase → SQL Editor, after 090. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Until now (db/038, db/065) the Pastor (any branch) and Leaders (own
-- branch) posted announcements. Now only the Secretary does, for their
-- own branch or one of its ministries. The Pastor and Leaders still read
-- them like everyone else. The "announcements ..." policies call this
-- function, so they need no change.
-- =====================================================================

begin;

create or replace function public.can_edit_announcement(cid uuid, mid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when mid is not null and not exists (select 1 from ministries where id = mid and church_id is not distinct from cid) then false
    when public.get_my_role() = 'secretary' then cid is not null and cid = public.get_my_church_id()
    else false
  end;
$$;

commit;

-- =====================================================================
-- Verify (run after commit). Expect true.
--
-- select pg_get_functiondef('public.can_edit_announcement(uuid,uuid)'::regprocedure)
--        like '%secretary%' as secretary_only;
-- =====================================================================
