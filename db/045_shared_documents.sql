-- =====================================================================
-- 045 — Assistant documents for all branches
--
-- Run in Supabase → SQL Editor, after 044. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- A document with no branch (church_id null) is shared: every branch's
-- assistant uses it — books like "Everyone's a Theologian", the statement
-- of faith, the staff guide. Upload once instead of once per branch.
--
-- Who:
--   reads shared documents   everyone signed in (staff-only ones: staff)
--   adds / changes / deletes the Pastor only. Unchanged policies (db/007):
--                            a Leader may only write church_id = their own
--                            branch, which a shared document never matches.
--
-- The index (knowledge_chunks) follows: shared documents are searched in
-- every branch, and moving a document between one branch and all branches
-- moves its passages too. search_knowledge now also returns each passage's
-- church_id, so the app can put a branch's own document first when a
-- shared one says much the same.
--
-- Also: documents no longer need a type (the "Document Type" picker is
-- gone; it was only a label).
-- =====================================================================

begin;

set local search_path = public, extensions;

alter table public.chatbot_documents alter column church_id drop not null;
alter table public.chatbot_documents alter column doc_type  drop not null;

-- ---------------------------------------------------------------------
-- Reading (was db/039: own branch, or every branch for Admin / Pastor)
-- ---------------------------------------------------------------------
drop policy if exists "chatbot_documents_select" on public.chatbot_documents;
create policy "chatbot_documents_select"
  on public.chatbot_documents for select to authenticated
  using (
    (public.get_my_role() in ('admin', 'pastor')
     or church_id = public.get_my_church_id()
     or (church_id is null and public.get_my_role() is not null))
    and (not staff_only or coalesce(public.get_my_role(), 'member') <> 'member')
  );

drop policy if exists "knowledge read" on public.knowledge_chunks;
create policy "knowledge read"
  on public.knowledge_chunks for select to authenticated
  using (
    public.get_my_role() is not null
    and (not staff_only or public.get_my_role() <> 'member')
    and (
      (source_type = 'document'
        and (public.get_my_role() in ('admin', 'pastor')
             or church_id = public.get_my_church_id()
             or church_id is null))
      or (source_type = 'handout' and public.can_see_module(module_id))
    )
  );

-- ---------------------------------------------------------------------
-- Keep the index in step: on/off, staff-only and branch follow the document.
-- ---------------------------------------------------------------------
create or replace function public.knowledge_follow_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from knowledge_chunks where source_type = 'document' and source_id = old.id::text;
    return old;
  end if;
  if new.is_active is distinct from old.is_active
     or new.staff_only is distinct from old.staff_only
     or new.church_id is distinct from old.church_id then
    update knowledge_chunks
       set is_active  = coalesce(new.is_active, true),
           staff_only = coalesce(new.staff_only, false),
           church_id  = new.church_id
     where source_type = 'document' and source_id = new.id::text;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Search: the branch's documents plus shared ones; returns church_id.
-- Same as db/039 otherwise. The return columns change, so it's dropped
-- and made again.
-- ---------------------------------------------------------------------
drop function if exists public.search_knowledge(text[], vector, uuid, integer, bigint);

create function public.search_knowledge(
  q_terms     text[],
  q_embedding vector(384) default null,
  p_church    uuid default null,
  match_count integer default 6,
  p_module    bigint default null
)
returns table (
  id           bigint,
  source_type  text,
  source_id    text,
  church_id    uuid,
  title        text,
  subtitle     text,
  content      text,
  text_rank    real,
  similarity   double precision,
  fuzzy        real,
  score        double precision
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  my_role   text := public.get_my_role();
  branch    uuid;
  terms     text[];
  ors       text;
  tsq       tsquery;
begin
  if my_role is null then
    return;
  end if;

  branch := case when my_role in ('admin', 'pastor') and p_church is not null then p_church
                 else public.get_my_church_id() end;

  select array_agg(distinct w) into terms
  from (
    select regexp_replace(lower(t), '[^a-z0-9]', '', 'g') as w
    from unnest(coalesce(q_terms, '{}')) as t
  ) x
  where length(w) >= 2;

  if terms is not null then
    ors := array_to_string(array(select w || ':*' from unnest(terms) as w), ' | ');
    tsq := to_tsquery('english', ors) || to_tsquery('simple', ors);
  end if;

  return query
  with vis as (
    select c.*
    from knowledge_chunks c
    where c.is_active
      and (
        (c.source_type = 'document'
          and (c.church_id = branch
               or c.church_id is null                                   -- all branches
               or (branch is null and my_role in ('admin', 'pastor'))))
        or (c.source_type = 'handout' and public.can_see_module(c.module_id))
      )
      -- "Ask about this lesson": only that module's handouts
      and (p_module is null or (c.source_type = 'handout' and c.module_id = p_module))
      -- staff-only documents (e.g. the FaithSync staff guide) never reach members
      and (not c.staff_only or my_role <> 'member')
  ),
  by_text as (
    select v.id, ts_rank_cd(v.fts, tsq, 32) as r,
           row_number() over (order by ts_rank_cd(v.fts, tsq, 32) desc) as rk
    from vis v
    where tsq is not null and v.fts @@ tsq
    order by r desc
    limit 30
  ),
  by_meaning as (
    select v.id, 1 - (v.embedding <=> q_embedding) as sim,
           row_number() over (order by v.embedding <=> q_embedding) as rk
    from vis v
    where q_embedding is not null and v.embedding is not null
    order by v.embedding <=> q_embedding
    limit 30
  ),
  by_typo as (
    select f.id, f.ws, row_number() over (order by f.ws desc) as rk
    from (
      select v.id, max(word_similarity(t, v.content)) as ws
      from vis v, unnest(coalesce(terms, '{}')) as t
      where length(t) >= 4
      group by v.id
    ) f
    where f.ws >= 0.7
    order by f.ws desc
    limit 30
  ),
  merged as (
    select coalesce(a.id, b.id, c.id) as id,
           a.r, b.sim, c.ws,
           coalesce(1.0 / (60 + a.rk), 0) + coalesce(1.0 / (60 + b.rk), 0) + coalesce(0.5 / (60 + c.rk), 0) as s
    from by_text a
    full join by_meaning b on b.id = a.id
    full join by_typo c on c.id = coalesce(a.id, b.id)
  )
  select v.id, v.source_type, v.source_id, v.church_id, v.title, v.subtitle, v.content,
         coalesce(m.r, 0)::real, m.sim::double precision, coalesce(m.ws, 0)::real, m.s::double precision
  from merged m
  join vis v on v.id = m.id
  order by m.s desc
  limit greatest(match_count, 1);
end;
$$;

revoke all on function public.search_knowledge(text[], vector, uuid, integer, bigint) from anon, public;
grant execute on function public.search_knowledge(text[], vector, uuid, integer, bigint) to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect church_id_nullable = 'YES' and
-- returns_church_id = true.
--
-- select is_nullable as church_id_nullable from information_schema.columns
--  where table_schema = 'public' and table_name = 'chatbot_documents' and column_name = 'church_id';
-- select bool_or(pg_get_function_result(oid) like '%church_id uuid%') as returns_church_id
--   from pg_proc where pronamespace = 'public'::regnamespace and proname = 'search_knowledge';
-- =====================================================================
