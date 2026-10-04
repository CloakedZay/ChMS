-- =====================================================================
-- 009 — User maintenance: Admin sets other users' level and branch
--
-- Run in Supabase → SQL Editor, after 008. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Before: admin could read every profile but not save changes to anyone
--         else's, so the Users page couldn't promote or demote. An admin
--         could change their own level and lock themselves out.
-- After:  admin can update any profile (the trigger still keeps level and
--         branch admin-only); nobody can change their own level — another
--         admin has to, so the church never loses its last admin by
--         accident. The SQL Editor can still change anything.
-- =====================================================================

begin;

drop policy if exists "admin update profiles" on public.profiles;
create policy "admin update profiles"
  on public.profiles for update to authenticated
  using      (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- Same as db/001, plus the "not your own level" rule.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (new.role is distinct from old.role
      or new.church_id is distinct from old.church_id)
     and coalesce(public.get_my_role(), '') <> 'admin' then
    raise exception 'Only an admin can change a user''s role or church';
  end if;

  if new.role is distinct from old.role and old.id = auth.uid() then
    raise exception 'You can''t change your own level. Ask another admin.';
  end if;

  return new;
end;
$$;

commit;

-- =====================================================================
-- Verify (run after commit). Expect: "admin update profiles" (UPDATE)
-- among the profile rules, and the last row 'own-level rule' = true.
--
-- select 'policy' as kind, policyname as name, cmd::text as info1, qual as info2
-- from pg_policies where schemaname = 'public' and tablename = 'profiles'
-- union all
-- select 'zcheck', 'own-level rule', (prosrc like '%your own level%')::text, null
-- from pg_proc where proname = 'protect_profile_privileges'
-- order by 1, 2;
-- =====================================================================
