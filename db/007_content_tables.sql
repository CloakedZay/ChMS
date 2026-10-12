-- =====================================================================
-- 007 — Content tables: only Pastor and Leader edit; Admin view-only
--
-- Run in Supabase → SQL Editor, after 001–006. Wrapped in a transaction:
-- if any line fails, nothing is applied. Read rules are unchanged.
--
-- Before: admin and the old 'staff' level could edit modules, questions,
--         handouts, chatbot documents, bible verses, ministries and events.
--         Any logged-in user (even a member) could create an event, already
--         marked 'approved'.
-- After:
--   modules, questions, handouts (+ files), bible verses
--                          → pastor, leader edit
--   chatbot documents      → pastor any branch, leader own church
--   ministries             → pastor only
--   events                 → pastor: everything, any branch
--                            leader: add / edit own events in own church,
--                                    only as 'planning' or 'pending';
--                                    no approve, no delete
--   everyone else          → read only (as before)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Modules and questions
-- ---------------------------------------------------------------------
drop policy if exists "Staff can manage modules"          on public.discipleship_modules;
drop policy if exists "pastor leader manage modules"      on public.discipleship_modules;
create policy "pastor leader manage modules"
  on public.discipleship_modules for all to authenticated
  using      (public.get_my_role() in ('pastor', 'leader'))
  with check (public.get_my_role() in ('pastor', 'leader'));

drop policy if exists "Staff can manage questions"        on public.discipleship_questions;
drop policy if exists "pastor leader manage questions"    on public.discipleship_questions;
create policy "pastor leader manage questions"
  on public.discipleship_questions for all to authenticated
  using      (public.get_my_role() in ('pastor', 'leader'))
  with check (public.get_my_role() in ('pastor', 'leader'));

-- ---------------------------------------------------------------------
-- Handout records and files (storage bucket 'handouts')
-- ---------------------------------------------------------------------
drop policy if exists "Staff can insert handouts"         on public.module_handouts;
drop policy if exists "pastor leader add handouts"        on public.module_handouts;
create policy "pastor leader add handouts"
  on public.module_handouts for insert to authenticated
  with check (public.get_my_role() in ('pastor', 'leader'));

drop policy if exists "Staff can delete handouts"         on public.module_handouts;
drop policy if exists "pastor leader delete handouts"     on public.module_handouts;
create policy "pastor leader delete handouts"
  on public.module_handouts for delete to authenticated
  using (public.get_my_role() in ('pastor', 'leader'));

drop policy if exists "Staff can upload handouts"         on storage.objects;
drop policy if exists "pastor leader upload handouts"     on storage.objects;
create policy "pastor leader upload handouts"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'handouts'
    and public.get_my_role() in ('pastor', 'leader')
  );

drop policy if exists "Staff can delete handouts"         on storage.objects;
drop policy if exists "pastor leader delete handout files" on storage.objects;
create policy "pastor leader delete handout files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'handouts'
    and public.get_my_role() in ('pastor', 'leader')
  );

-- ---------------------------------------------------------------------
-- Chatbot documents — pastor any branch, leader own church.
-- chatbot_documents_select is unchanged.
-- ---------------------------------------------------------------------
drop policy if exists "chatbot_documents_insert" on public.chatbot_documents;
create policy "chatbot_documents_insert"
  on public.chatbot_documents for insert to authenticated
  with check (
    public.get_my_role() = 'pastor'
    or (public.get_my_role() = 'leader' and church_id = public.get_my_church_id())
  );

drop policy if exists "chatbot_documents_update" on public.chatbot_documents;
create policy "chatbot_documents_update"
  on public.chatbot_documents for update to authenticated
  using (
    public.get_my_role() = 'pastor'
    or (public.get_my_role() = 'leader' and church_id = public.get_my_church_id())
  )
  with check (
    public.get_my_role() = 'pastor'
    or (public.get_my_role() = 'leader' and church_id = public.get_my_church_id())
  );

drop policy if exists "chatbot_documents_delete" on public.chatbot_documents;
create policy "chatbot_documents_delete"
  on public.chatbot_documents for delete to authenticated
  using (
    public.get_my_role() = 'pastor'
    or (public.get_my_role() = 'leader' and church_id = public.get_my_church_id())
  );

-- ---------------------------------------------------------------------
-- Bible verses. "Public read access" is unchanged.
-- ---------------------------------------------------------------------
drop policy if exists "Staff can add verses"        on public.bible_verses;
drop policy if exists "pastor leader add verses"    on public.bible_verses;
create policy "pastor leader add verses"
  on public.bible_verses for insert to authenticated
  with check (public.get_my_role() in ('pastor', 'leader'));

drop policy if exists "Staff can delete verses"     on public.bible_verses;
drop policy if exists "pastor leader delete verses" on public.bible_verses;
create policy "pastor leader delete verses"
  on public.bible_verses for delete to authenticated
  using (public.get_my_role() in ('pastor', 'leader'));

-- ---------------------------------------------------------------------
-- Ministries — pastor only. "authenticated read ministries" is unchanged.
-- ---------------------------------------------------------------------
drop policy if exists "admin pastor manage ministries" on public.ministries;
drop policy if exists "pastor manage ministries"       on public.ministries;
create policy "pastor manage ministries"
  on public.ministries for all to authenticated
  using      (public.get_my_role() = 'pastor')
  with check (public.get_my_role() = 'pastor');

-- ---------------------------------------------------------------------
-- Events. "view events scoped" (read) is unchanged.
-- The events page doesn't send created_by, so the database fills it in
-- with the logged-in user; leaders can then find and edit their own.
-- ---------------------------------------------------------------------
alter table public.events alter column created_by set default auth.uid();

drop policy if exists "Admins/Pastors can manage events" on public.events;
drop policy if exists "pastor manage events"             on public.events;
create policy "pastor manage events"
  on public.events for all to authenticated
  using      (public.get_my_role() = 'pastor')
  with check (public.get_my_role() = 'pastor');

-- Was open to every logged-in user, with any status.
drop policy if exists "leader staff create events"  on public.events;
drop policy if exists "leader create events"        on public.events;
create policy "leader create events"
  on public.events for insert to authenticated
  with check (
    public.get_my_role() = 'leader'
    and church_id = public.get_my_church_id()
    and created_by = auth.uid()
    and status in ('planning', 'pending')
  );

-- Was 'pending' only, but new events start as 'planning'.
drop policy if exists "leader edit own pending events" on public.events;
drop policy if exists "leader edit own events"         on public.events;
create policy "leader edit own events"
  on public.events for update to authenticated
  using (
    public.get_my_role() = 'leader'
    and church_id = public.get_my_church_id()
    and created_by = auth.uid()
    and status in ('planning', 'pending')
  )
  with check (
    public.get_my_role() = 'leader'
    and church_id = public.get_my_church_id()
    and created_by = auth.uid()
    and status in ('planning', 'pending')
  );

commit;

-- =====================================================================
-- Verify (run after commit). Expect: no 'admin' or 'staff' in any
-- INSERT / UPDATE / DELETE / ALL row, and the last row showing
-- created_by default = auth.uid().
--
-- select tablename, policyname, cmd::text, roles::text, qual, with_check
-- from pg_policies
-- where (schemaname = 'public' and tablename in
--         ('discipleship_modules','discipleship_questions','module_handouts',
--          'chatbot_documents','bible_verses','events','ministries'))
--    or (schemaname = 'storage' and (qual like '%handouts%' or with_check like '%handouts%'))
-- union all
-- select 'events', 'created_by default', 'DEFAULT', null, column_default, null
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'events' and column_name = 'created_by'
-- order by 1, 2;
-- =====================================================================
