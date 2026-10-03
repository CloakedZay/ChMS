-- =====================================================================
-- 001 — Close critical RLS holes (Part A: SQL-only, no app code changes)
--
-- Run in Supabase → SQL Editor. Wrapped in a transaction: if any line
-- fails, nothing is applied.
--
-- NOT included here (needs an app code change first, see Part B):
--   * chatbot_documents "Allow anon full access" / "Public insert access"
--   * bible_verses "Public insert access" / "Public delete access"
-- The /api routes use the anon key with no user session, so dropping
-- those policies now would break the chatbot and verse upload.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Hole 1: any user can change their own profiles.role (e.g. to 'admin').
-- Keep "Users can update own profile" (the profile page edits full_name)
-- but block role / church_id changes unless the caller is an admin.
-- auth.uid() is null in the SQL Editor / service role, so you can still
-- fix roles manually from here.
-- ---------------------------------------------------------------------
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role
      or new.church_id is distinct from old.church_id)
     and auth.uid() is not null
     and coalesce(public.get_my_role(), '') <> 'admin' then
    raise exception 'Only an admin can change a user''s role or church';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileges on public.profiles;
create trigger trg_protect_profile_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- ---------------------------------------------------------------------
-- Hole 3: every logged-in user can read all transactions.
-- The scoped policy already covers admin / pastor / staff. Add leaders
-- (view only, own church) per the agreed role design.
-- ---------------------------------------------------------------------
drop policy if exists "Members can view transactions" on public.transactions;

drop policy if exists "leaders view transactions scoped" on public.transactions;
create policy "leaders view transactions scoped"
  on public.transactions for select to authenticated
  using (public.get_my_role() = 'leader' and church_id = public.get_my_church_id());

-- ---------------------------------------------------------------------
-- Hole 4: anyone (even logged out) can edit/delete modules & questions.
-- Restrict management to dashboard roles. Read policies are unchanged.
-- ---------------------------------------------------------------------
drop policy if exists "Staff can manage modules" on public.discipleship_modules;
create policy "Staff can manage modules"
  on public.discipleship_modules for all to authenticated
  using      (public.get_my_role() in ('admin', 'pastor', 'leader', 'staff'))
  with check (public.get_my_role() in ('admin', 'pastor', 'leader', 'staff'));

drop policy if exists "Staff can manage questions" on public.discipleship_questions;
create policy "Staff can manage questions"
  on public.discipleship_questions for all to authenticated
  using      (public.get_my_role() in ('admin', 'pastor', 'leader', 'staff'))
  with check (public.get_my_role() in ('admin', 'pastor', 'leader', 'staff'));

-- ---------------------------------------------------------------------
-- Hole 5: ministries has RLS disabled. The app doesn't query this table
-- yet, so this is safe: logged-in users can read, admin/pastor manage.
-- ---------------------------------------------------------------------
alter table public.ministries enable row level security;

drop policy if exists "authenticated read ministries" on public.ministries;
create policy "authenticated read ministries"
  on public.ministries for select to authenticated
  using (true);

drop policy if exists "admin pastor manage ministries" on public.ministries;
create policy "admin pastor manage ministries"
  on public.ministries for all to authenticated
  using      (public.get_my_role() in ('admin', 'pastor'))
  with check (public.get_my_role() in ('admin', 'pastor'));

-- ---------------------------------------------------------------------
-- Hole 7: any logged-in member can upload/delete handout records.
-- ---------------------------------------------------------------------
drop policy if exists "Staff can insert handouts" on public.module_handouts;
create policy "Staff can insert handouts"
  on public.module_handouts for insert to authenticated
  with check (public.get_my_role() in ('admin', 'pastor', 'leader', 'staff'));

drop policy if exists "Staff can delete handouts" on public.module_handouts;
create policy "Staff can delete handouts"
  on public.module_handouts for delete to authenticated
  using (public.get_my_role() in ('admin', 'pastor', 'leader', 'staff'));

commit;

-- =====================================================================
-- Verify (run after commit)
-- =====================================================================
-- Policies now on the touched tables:
-- select tablename, policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('profiles','transactions','discipleship_modules',
--                     'discipleship_questions','ministries','module_handouts')
-- order by tablename, policyname;
--
-- Transactions with no church_id (leaders/staff can't see these rows):
-- select count(*) from public.transactions where church_id is null;
