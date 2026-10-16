-- =====================================================================
-- 070 — The Admin adds and manages assistant documents, like the Pastor
--
-- Run in Supabase → SQL Editor, after 069. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Until now only the Pastor (any branch) and Leaders (own branch) could
-- add, change or delete the documents the assistant answers from; the
-- Admin could only look at the list. Now the Admin can do everything the
-- Pastor can: upload to any branch or to all branches, switch Staff only
-- and This branch / All branches, turn documents off, delete them and
-- rebuild the search index for them.
--
-- Training handouts stay with the Pastor and Leaders (the Admin only views
-- training), so can_write_knowledge keeps its handout rule.
-- =====================================================================

begin;

drop policy if exists "chatbot_documents_insert" on public.chatbot_documents;
create policy "chatbot_documents_insert"
  on public.chatbot_documents for insert to authenticated
  with check (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() = 'leader' and church_id = public.get_my_church_id())
  );

drop policy if exists "chatbot_documents_update" on public.chatbot_documents;
create policy "chatbot_documents_update"
  on public.chatbot_documents for update to authenticated
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() = 'leader' and church_id = public.get_my_church_id())
  )
  with check (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() = 'leader' and church_id = public.get_my_church_id())
  );

drop policy if exists "chatbot_documents_delete" on public.chatbot_documents;
create policy "chatbot_documents_delete"
  on public.chatbot_documents for delete to authenticated
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() = 'leader' and church_id = public.get_my_church_id())
  );

-- The search index (knowledge_chunks, db/035) for documents follows the
-- same rule; handouts unchanged (db/065).
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
      public.get_my_role() in ('pastor', 'leader') and public.can_edit_module(mod_id)
    else false
  end;
$$;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 3 rows, each with admin = true.
--
-- select policyname, (coalesce(qual, '') || coalesce(with_check, '')) like '%admin%' as admin
-- from pg_policies
-- where tablename = 'chatbot_documents'
--   and policyname in ('chatbot_documents_insert', 'chatbot_documents_update', 'chatbot_documents_delete');
-- =====================================================================
