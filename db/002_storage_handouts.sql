-- =====================================================================
-- 002 — Restrict handout file upload/delete in the 'handouts' bucket
--
-- Run AFTER 001. Kept separate because some Supabase projects don't allow
-- storage policy changes from the SQL Editor; if this errors with
-- "must be owner", make the same changes in Storage → Policies instead.
--
-- Before: any logged-in user could upload or delete handout files.
-- After:  only admin / pastor / leader / staff can; all logged-in users
--         can still read (members download handouts).
-- =====================================================================

begin;

-- Duplicate of "Authenticated users can read handouts" — same rule.
drop policy if exists "Staff can read handouts" on storage.objects;

drop policy if exists "Staff can upload handouts" on storage.objects;
create policy "Staff can upload handouts"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'handouts'
    and public.get_my_role() in ('admin', 'pastor', 'leader', 'staff')
  );

drop policy if exists "Staff can delete handouts" on storage.objects;
create policy "Staff can delete handouts"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'handouts'
    and public.get_my_role() in ('admin', 'pastor', 'leader', 'staff')
  );

commit;

-- Verify:
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies where schemaname = 'storage';
