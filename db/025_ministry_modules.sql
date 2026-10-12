-- =====================================================================
-- 025 — Modules per ministry (step M3)
--
-- Run in Supabase → SQL Editor. Wrapped in a transaction: if any line
-- fails, nothing is applied.
--
-- A discipleship module now either belongs to one ministry
-- (discipleship_modules.ministry_id) or is general (null) — today's
-- modules stay general. General modules are the main discipleship path;
-- each ministry's modules have their own order (the app unlocks a module
-- when the previous one in the same group is finished).
--
-- Who edits a module, its questions, handouts and handout files
-- (was: any Pastor or Leader, db/007):
--   Pastor  → any module
--   Leader  → general modules (as before) and modules of a ministry they
--             head (ministries.leader_id); not other ministries' modules
-- Reading modules is unchanged (everyone); the app shows members general
-- modules plus those of their own ministries.
-- =====================================================================

begin;

alter table public.discipleship_modules
  add column if not exists ministry_id uuid references public.ministries (id) on delete set null;

create index if not exists discipleship_modules_ministry_idx on public.discipleship_modules (ministry_id);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
-- May the signed-in user put a module in this ministry (null = general)?
create or replace function public.can_edit_module_group(min_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.get_my_role()
           when 'pastor' then true
           when 'leader' then min_id is null or public.is_ministry_head(min_id)
           else false
         end;
$$;

-- May the signed-in user edit this module (and its questions / handouts)?
create or replace function public.can_edit_module(mod_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from discipleship_modules
    where id = mod_id and public.can_edit_module_group(ministry_id)
  );
$$;

-- Module number from a handout path "module-12/…"; null for other paths.
create or replace function public.handout_module_id(path text)
returns bigint
language sql
immutable
as $$
  select case when split_part(path, '/', 1) ~ '^module-[0-9]{1,18}$'
              then substring(split_part(path, '/', 1) from 8)::bigint end;
$$;

-- ---------------------------------------------------------------------
-- Modules (reading: "Members can view modules", unchanged)
-- ---------------------------------------------------------------------
drop policy if exists "pastor leader manage modules" on public.discipleship_modules;
drop policy if exists "add modules"    on public.discipleship_modules;
drop policy if exists "edit modules"   on public.discipleship_modules;
drop policy if exists "delete modules" on public.discipleship_modules;

create policy "add modules"
  on public.discipleship_modules for insert to authenticated
  with check (public.can_edit_module_group(ministry_id));

create policy "edit modules"
  on public.discipleship_modules for update to authenticated
  using      (public.can_edit_module(id))
  with check (public.can_edit_module_group(ministry_id));   -- can't move it into someone else's ministry

create policy "delete modules"
  on public.discipleship_modules for delete to authenticated
  using (public.can_edit_module(id));

-- ---------------------------------------------------------------------
-- Questions (reading: "Members can view questions", unchanged)
-- ---------------------------------------------------------------------
drop policy if exists "pastor leader manage questions" on public.discipleship_questions;
drop policy if exists "edit module questions" on public.discipleship_questions;
create policy "edit module questions"
  on public.discipleship_questions for all to authenticated
  using      (public.can_edit_module(module_id))
  with check (public.can_edit_module(module_id));

-- ---------------------------------------------------------------------
-- Handout records and files
-- ---------------------------------------------------------------------
drop policy if exists "pastor leader add handouts" on public.module_handouts;
drop policy if exists "add module handouts" on public.module_handouts;
create policy "add module handouts"
  on public.module_handouts for insert to authenticated
  with check (public.can_edit_module(module_id));

drop policy if exists "pastor leader delete handouts" on public.module_handouts;
drop policy if exists "delete module handouts" on public.module_handouts;
create policy "delete module handouts"
  on public.module_handouts for delete to authenticated
  using (public.can_edit_module(module_id));

-- Files: checked by the module in the path. Older files stored under
-- another path keep the old rule (Pastor or any Leader).
drop policy if exists "pastor leader upload handouts" on storage.objects;
drop policy if exists "upload handout files" on storage.objects;
create policy "upload handout files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'handouts'
    and public.can_edit_module(public.handout_module_id(name))
  );

drop policy if exists "pastor leader delete handout files" on storage.objects;
drop policy if exists "delete handout files" on storage.objects;
create policy "delete handout files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'handouts'
    and (
      public.can_edit_module(public.handout_module_id(name))
      or (public.handout_module_id(name) is null and public.get_my_role() in ('pastor', 'leader'))
    )
  );

commit;

-- =====================================================================
-- Verify (run after commit). Expect: 'ministry_id column' = uuid;
-- 'general modules' = all of today's modules; policies "add modules",
-- "edit modules", "delete modules", "edit module questions",
-- "add module handouts", "delete module handouts", "upload handout
-- files", "delete handout files".
--
-- select 'ministry_id column' as kind, data_type as info
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'discipleship_modules' and column_name = 'ministry_id'
-- union all
-- select 'general modules', count(*)::text from public.discipleship_modules where ministry_id is null
-- union all
-- select 'policy: ' || policyname, cmd::text from pg_policies
-- where (tablename in ('discipleship_modules', 'discipleship_questions', 'module_handouts'))
--    or (schemaname = 'storage' and policyname like '%handout files%')
-- order by 1;
-- =====================================================================
