-- =====================================================================
-- 036 — Assistant spell-check vocabulary
--
-- Run in Supabase → SQL Editor, after 035. Wrapped in a transaction.
--
-- knowledge_vocabulary() — every distinct word in the assistant's search
-- index (titles + passages of active documents and handouts), with how
-- many passages use it. The app uses this as its dictionary to correct
-- typos in questions ("chech reports" → "check reports", "ikapo" →
-- "ikapu"). Only single words are returned, never any passage text.
-- =====================================================================

begin;

create or replace function public.knowledge_vocabulary()
returns table (word text, ndoc integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.word, s.ndoc
  from ts_stat($q$
    select to_tsvector('simple', coalesce(title, '') || ' ' || content)
    from public.knowledge_chunks
    where is_active
  $q$) s
  where public.get_my_role() is not null
    and length(s.word) between 3 and 30
    and s.word ~ '^[a-z]+$';
$$;

revoke all on function public.knowledge_vocabulary() from anon, public;
grant execute on function public.knowledge_vocabulary() to authenticated;

commit;
