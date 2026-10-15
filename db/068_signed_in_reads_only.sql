-- =====================================================================
-- 068 — Only signed-in people read verses, modules and handouts
--
-- Run in Supabase → SQL Editor, after 067. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Five read rules made by hand in the dashboard (db/000) were open to
-- the "public" role: the Verse of the Day list, training modules and
-- their questions could be read by anyone holding the app's public key,
-- even signed out. The handout rules checked for a login inside the rule
-- but were still written for "public". Every rule below now applies to
-- signed-in logins ("authenticated") only. Nothing changes for people
-- using the app: every page and the assistant read these while signed in.
--
-- Modules, questions and verses are one list for every branch (they
-- have no branch column), so any signed-in login may still read them.
-- =====================================================================

begin;

drop policy if exists "Public read access" on public.bible_verses;
drop policy if exists "signed-in read verses" on public.bible_verses;
create policy "signed-in read verses"
  on public.bible_verses for select to authenticated
  using (true);

drop policy if exists "Members can view modules" on public.discipleship_modules;
drop policy if exists "signed-in read modules" on public.discipleship_modules;
create policy "signed-in read modules"
  on public.discipleship_modules for select to authenticated
  using (true);

drop policy if exists "Members can view questions" on public.discipleship_questions;
drop policy if exists "signed-in read questions" on public.discipleship_questions;
create policy "signed-in read questions"
  on public.discipleship_questions for select to authenticated
  using (true);

drop policy if exists "Authenticated users can view handouts" on public.module_handouts;
drop policy if exists "signed-in read handouts" on public.module_handouts;
create policy "signed-in read handouts"
  on public.module_handouts for select to authenticated
  using (true);

drop policy if exists "Authenticated users can read handouts" on storage.objects;
drop policy if exists "signed-in read handout files" on storage.objects;
create policy "signed-in read handout files"
  on storage.objects for select to authenticated
  using (bucket_id = 'handouts');

commit;

-- =====================================================================
-- Verify (run after commit). Expect 5 rows, each with roles {authenticated}.
--
-- select tablename, policyname, roles from pg_policies
-- where policyname like 'signed-in read%';
--
-- And none left open to signed-out visitors on these tables (expect 0 rows):
--
-- select tablename, policyname from pg_policies
-- where cmd = 'SELECT' and 'public' = any(roles)
--   and tablename in ('bible_verses', 'discipleship_modules', 'discipleship_questions', 'module_handouts');
-- =====================================================================
