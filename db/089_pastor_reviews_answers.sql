-- =====================================================================
-- 089 — Only the Pastor approves or rejects discipleship answers
--
-- Run in Supabase → SQL Editor, after 088. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Until now (db/008) the Pastor (any branch) and Leaders (own branch)
-- could approve or reject members' answers. Now only the Pastor can;
-- Leaders still see the answers (reading rules unchanged). Members still
-- edit their own answers ("members edit own answers", db/008).
-- =====================================================================

begin;

drop policy if exists "pastor leader review answers" on public.discipleship_progress;
drop policy if exists "pastor reviews answers"       on public.discipleship_progress;
create policy "pastor reviews answers"
  on public.discipleship_progress for update to authenticated
  using      (member_id is distinct from auth.uid() and public.get_my_role() = 'pastor')
  with check (member_id is distinct from auth.uid() and public.get_my_role() = 'pastor');

commit;

-- =====================================================================
-- Verify (run after commit). Expect "members edit own answers" and
-- "pastor reviews answers", and no "pastor leader review answers".
--
-- select policyname from pg_policies
--  where tablename = 'discipleship_progress' and cmd = 'UPDATE';
-- =====================================================================
