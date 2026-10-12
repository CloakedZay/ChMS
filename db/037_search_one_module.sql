-- =====================================================================
-- 037 — Assistant: search inside one module ("Ask about this lesson")
--
-- Run in Supabase → SQL Editor, after 035. Wrapped in a transaction.
--
-- search_knowledge() gets one more optional input, p_module. When it is
-- given, only that discipleship module's handouts are searched — used by
-- the "Ask about this lesson" box on the member Discipleship page. All
-- other rules are unchanged (members still only see modules they may).
-- =====================================================================

begin;

set local search_path = public, extensions;

drop function if exists public.search_knowledge(text[], vector, uuid, integer);

create or replace function public.search_knowledge(
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
      -- "Ask about this lesson": only that module's handouts
      and (p_module is null or (c.source_type = 'handout' and c.module_id = p_module))
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

revoke all on function public.search_knowledge(text[], vector, uuid, integer, bigint) from anon, public;
grant execute on function public.search_knowledge(text[], vector, uuid, integer, bigint) to authenticated;

commit;
