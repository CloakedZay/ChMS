-- =====================================================================
-- 044 — Members see only approved and done events
--
-- Run in Supabase → SQL Editor, after 043. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Planning and pending events are drafts (budgets, plans the Pastor
-- hasn't approved yet). Who can read events after this:
--   Admin, Pastor          every event, every branch
--   Leader, Ministry Head,
--   Finance, Secretary     every event in their own branch
--   Member                 approved and done events in their own branch
--   anyone                 events they filed themselves
--
-- The old read policy ("view events scoped") was made in the Supabase
-- dashboard, not in these files, so every read-only policy on events is
-- dropped by lookup and replaced with the one below. The write policies
-- (db/007, db/038) are not touched.
-- =====================================================================

begin;

do $$
declare
  p record;
begin
  for p in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'events' and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.events', p.policyname);
  end loop;
end;
$$;

create policy "view events scoped"
  on public.events for select to authenticated
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (church_id = public.get_my_church_id()
        and (public.get_my_role() in ('leader', 'ministry_head', 'finance', 'secretary')
             or status in ('approved', 'done')))
    or created_by = auth.uid()
  );

commit;

-- =====================================================================
-- Verify (run after commit). Expect one row per policy; the only one with
-- cmd = 'SELECT' should be "view events scoped". "pastor manage events"
-- (ALL) is the Pastor's and fine; any other ALL policy that isn't limited
-- to the Pastor would let members see drafts again.
--
-- select policyname, cmd, roles from pg_policies
--  where schemaname = 'public' and tablename = 'events' order by cmd, policyname;
-- =====================================================================
