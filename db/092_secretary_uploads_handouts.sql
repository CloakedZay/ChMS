-- =====================================================================
-- 092 — The Secretary uploads training handouts
--
-- Run in Supabase → SQL Editor, after 091. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- The Pastor (and the Leader who heads a ministry) hand the training
-- materials to the Secretary, who uploads the PDF files. Until now
-- (db/025, db/088) the module's owner uploaded them. Now only the
-- Secretary adds and deletes handouts and handout files:
--   General discipleship path modules  → any Secretary
--   A ministry's modules               → the Secretary of that branch
-- Module owners still add and edit the modules and their questions.
-- Reading is unchanged (db/068).
-- =====================================================================

begin;

create or replace function public.can_manage_handouts(mod_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_my_role() = 'secretary'
     and exists (
       select 1 from discipleship_modules d
       left join ministries m on m.id = d.ministry_id
       where d.id = mod_id
         and (d.ministry_id is null or m.church_id = public.get_my_church_id())
     );
$$;

drop policy if exists "add module handouts" on public.module_handouts;
create policy "add module handouts"
  on public.module_handouts for insert to authenticated
  with check (public.can_manage_handouts(module_id));

drop policy if exists "delete module handouts" on public.module_handouts;
create policy "delete module handouts"
  on public.module_handouts for delete to authenticated
  using (public.can_manage_handouts(module_id));

drop policy if exists "upload handout files" on storage.objects;
create policy "upload handout files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'handouts'
    and public.can_manage_handouts(public.handout_module_id(name))
  );

drop policy if exists "delete handout files" on storage.objects;
create policy "delete handout files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'handouts'
    and (
      public.can_manage_handouts(public.handout_module_id(name))
      or (public.handout_module_id(name) is null and public.get_my_role() = 'secretary')
    )
  );

-- The Assistant's search index for handouts follows the same rule
-- (documents unchanged from db/070).
create or replace function public.can_write_knowledge(stype text, cid uuid, mod_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when stype = 'document' then
      public.get_my_role() in ('admin', 'pastor')
      or (public.get_my_role() = 'leader' and cid = public.get_my_church_id())
    when stype = 'handout' then
      public.can_manage_handouts(mod_id)
    else false
  end;
$$;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 4 rows, each mentioning
-- can_manage_handouts.
--
-- select policyname, coalesce(qual, with_check) as rule from pg_policies
--  where policyname in ('add module handouts', 'delete module handouts',
--                       'upload handout files', 'delete handout files');
-- =====================================================================
