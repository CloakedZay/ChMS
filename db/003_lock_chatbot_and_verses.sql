-- =====================================================================
-- 003 — Remove anonymous access to chatbot_documents and bible_verses
--
-- RUN ONLY AFTER the app code from the same commit is deployed/running.
-- The /api routes now send the signed-in user's token (lib/authFetch.js,
-- lib/apiAuth.ts); the old code relied on the anon policies dropped here,
-- so running this against the old code breaks the chatbot and verse pages.
--
-- Roles below match lib/apiAuth.ts:
--   global roles  = admin, pastor          (any church branch)
--   content roles = admin, pastor, leader, staff
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Hole 2: chatbot_documents — anyone, even logged out, could read,
-- edit and delete every document.
-- ---------------------------------------------------------------------
drop policy if exists "Allow anon full access to chatbot_documents" on public.chatbot_documents;
drop policy if exists "Public insert access"                        on public.chatbot_documents;
drop policy if exists "chatbot_documents_select"                    on public.chatbot_documents;
drop policy if exists "chatbot_documents_insert"                    on public.chatbot_documents;
drop policy if exists "chatbot_documents_update"                    on public.chatbot_documents;

-- Everyone logged in reads their own church's documents (members need this
-- for the chatbot); admin/pastor read every branch.
create policy "chatbot_documents_select"
  on public.chatbot_documents for select to authenticated
  using (
    public.get_my_role() in ('admin', 'pastor')
    or church_id = public.get_my_church_id()
  );

create policy "chatbot_documents_insert"
  on public.chatbot_documents for insert to authenticated
  with check (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('leader', 'staff') and church_id = public.get_my_church_id())
  );

create policy "chatbot_documents_update"
  on public.chatbot_documents for update to authenticated
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('leader', 'staff') and church_id = public.get_my_church_id())
  )
  with check (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('leader', 'staff') and church_id = public.get_my_church_id())
  );

create policy "chatbot_documents_delete"
  on public.chatbot_documents for delete to authenticated
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('leader', 'staff') and church_id = public.get_my_church_id())
  );

-- ---------------------------------------------------------------------
-- Hole 6: bible_verses — anyone could add or delete verses.
-- "Public read access" is kept: the dashboards read verses directly.
-- ---------------------------------------------------------------------
drop policy if exists "Public insert access" on public.bible_verses;
drop policy if exists "Public delete access" on public.bible_verses;

create policy "Staff can add verses"
  on public.bible_verses for insert to authenticated
  with check (public.get_my_role() in ('admin', 'pastor', 'leader', 'staff'));

create policy "Staff can delete verses"
  on public.bible_verses for delete to authenticated
  using (public.get_my_role() in ('admin', 'pastor', 'leader', 'staff'));

commit;

-- =====================================================================
-- Verify (run after commit) — expect no policy with {anon} or a bare
-- "true" on insert/update/delete:
-- select tablename, policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename in ('chatbot_documents', 'bible_verses')
-- order by tablename, policyname;
-- =====================================================================
