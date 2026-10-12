-- =====================================================================
-- 035 — Assistant search index (NLP + semantic search)
--
-- Run in Supabase → SQL Editor. Wrapped in a transaction.
--
-- The assistant used to scan every document word-by-word on each
-- question. This adds a proper search index over two sources:
--   * chatbot documents (Assistant → Documents), per branch
--   * discipleship module handouts (Training), for every branch
--
-- knowledge_chunks — each source split into passages, with
--   fts        full-text index: English stemming ("praying" → "pray")
--              plus a plain index for Tagalog / Taglish words
--   embedding  a 384-number "meaning vector" from the multilingual-e5-small
--              model the app runs itself (nothing is sent to an outside
--              AI service), so questions match by meaning, not just words
-- search_knowledge(...) — hybrid search: full-text rank + meaning
--   similarity + typo-tolerant matching (pg_trgm), merged with
--   reciprocal rank fusion. Only returns passages the caller may see.
--
-- Who sees what (same as the sources):
--   documents  their own branch; Admin and Pastor every branch
--   handouts   everyone, except handouts of a ministry's own modules,
--              which members see only if they are in that ministry
--   inactive documents and inactive modules are left out
-- Who writes: the app server, as the signed-in Pastor / Leader (documents
--   in their scope; handouts of modules they may edit). Index rows of a
--   deleted document or handout are removed automatically.
-- =====================================================================

begin;

create extension if not exists vector  with schema extensions;
create extension if not exists pg_trgm with schema extensions;
-- Find the extensions' types and operators wherever they were installed.
set local search_path = public, extensions;

create table if not exists public.knowledge_chunks (
  id           bigint generated always as identity primary key,
  source_type  text not null check (source_type in ('document', 'handout')),
  source_id    text not null,          -- chatbot_documents.id / module_handouts.id
  church_id    uuid,                   -- documents: their branch; handouts: null
  module_id    bigint,                 -- handouts only
  title        text not null,
  subtitle     text,                   -- document type / module title
  chunk_index  integer not null default 0,
  content      text not null,
  is_active    boolean not null default true,
  embedding    vector(384),
  created_at   timestamptz not null default now(),
  fts          tsvector generated always as (
                 setweight(to_tsvector('english', coalesce(title, '')), 'A')
                 || setweight(to_tsvector('english', content), 'B')
                 || setweight(to_tsvector('simple', coalesce(title, '') || ' ' || content), 'C')
               ) stored
);

create index if not exists knowledge_chunks_source_idx on public.knowledge_chunks (source_type, source_id);
create index if not exists knowledge_chunks_fts_idx    on public.knowledge_chunks using gin (fts);
create index if not exists knowledge_chunks_trgm_idx   on public.knowledge_chunks using gin (content gin_trgm_ops);
create index if not exists knowledge_chunks_vec_idx    on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------
-- Can the signed-in user see this handout's module? General modules: yes.
-- A ministry's own module: staff yes; a member only if in that ministry.
create or replace function public.can_see_module(mod_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from discipleship_modules dm
    where dm.id = mod_id
      and coalesce(dm.is_active, true)
      and (
        dm.ministry_id is null
        or coalesce(public.get_my_role(), 'member') <> 'member'
        or exists (
          select 1 from ministry_assignments a
          join members m on m.id = a.member_id
          where a.ministry_id = dm.ministry_id and m.profile_id = auth.uid()
        )
      )
  );
$$;

-- May the signed-in user write index rows for this source?
create or replace function public.can_write_knowledge(stype text, cid uuid, mod_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when stype = 'document' then
      public.get_my_role() = 'pastor'
      or (public.get_my_role() = 'leader' and cid = public.get_my_church_id())
    when stype = 'handout' then
      public.get_my_role() in ('pastor', 'leader') and public.can_edit_module(mod_id)
    else false
  end;
$$;

alter table public.knowledge_chunks enable row level security;

drop policy if exists "knowledge read"   on public.knowledge_chunks;
drop policy if exists "knowledge insert" on public.knowledge_chunks;
drop policy if exists "knowledge delete" on public.knowledge_chunks;

create policy "knowledge read"
  on public.knowledge_chunks for select to authenticated
  using (
    public.get_my_role() is not null
    and (
      (source_type = 'document' and (public.get_my_role() in ('admin', 'pastor') or church_id = public.get_my_church_id()))
      or (source_type = 'handout' and public.can_see_module(module_id))
    )
  );

create policy "knowledge insert"
  on public.knowledge_chunks for insert to authenticated
  with check (public.can_write_knowledge(source_type, church_id, module_id));

create policy "knowledge delete"
  on public.knowledge_chunks for delete to authenticated
  using (public.can_write_knowledge(source_type, church_id, module_id));

revoke all on public.knowledge_chunks from anon, public;
grant select, insert, delete on public.knowledge_chunks to authenticated;

-- ---------------------------------------------------------------------
-- Keep the index in step with its sources
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
  if new.is_active is distinct from old.is_active then
    update knowledge_chunks set is_active = coalesce(new.is_active, true)
     where source_type = 'document' and source_id = new.id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_knowledge_follow_document on public.chatbot_documents;
create trigger trg_knowledge_follow_document
  after update or delete on public.chatbot_documents
  for each row execute function public.knowledge_follow_document();

create or replace function public.knowledge_follow_handout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from knowledge_chunks where source_type = 'handout' and source_id = old.id::text;
  return old;
end;
$$;

drop trigger if exists trg_knowledge_follow_handout on public.module_handouts;
create trigger trg_knowledge_follow_handout
  after delete on public.module_handouts
  for each row execute function public.knowledge_follow_handout();

-- ---------------------------------------------------------------------
-- search_knowledge — hybrid search for the assistant.
--   q_terms      search words (already cleaned / expanded by the app)
--   q_embedding  meaning vector of the question, or null
--   p_church     branch picked by Admin / Pastor (ignored for others)
-- ---------------------------------------------------------------------
create or replace function public.search_knowledge(
  q_terms     text[],
  q_embedding vector(384) default null,
  p_church    uuid default null,
  match_count integer default 6
)
returns table (
  id           bigint,
  source_type  text,
  source_id    text,
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
          and (c.church_id = branch or (branch is null and my_role in ('admin', 'pastor'))))
        or (c.source_type = 'handout' and public.can_see_module(c.module_id))
      )
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
  select v.id, v.source_type, v.source_id, v.title, v.subtitle, v.content,
         coalesce(m.r, 0)::real, m.sim::double precision, coalesce(m.ws, 0)::real, m.s::double precision
  from merged m
  join vis v on v.id = m.id
  order by m.s desc
  limit greatest(match_count, 1);
end;
$$;

revoke all on function public.can_see_module(bigint), public.can_write_knowledge(text, uuid, bigint),
  public.search_knowledge(text[], vector, uuid, integer) from anon, public;
grant execute on function public.can_see_module(bigint), public.can_write_knowledge(text, uuid, bigint),
  public.search_knowledge(text[], vector, uuid, integer) to authenticated;

commit;
