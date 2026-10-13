-- =====================================================================
-- 039 — Assistant: daily question limit and staff-only documents
--
-- Run in Supabase → SQL Editor, after 038. Wrapped in a transaction.
--
-- 1. Staff-only documents. An assistant document can be marked "staff
--    only" (e.g. the FaithSync staff guide). Members can't read it and the
--    assistant never uses its passages when a member asks. Staff (every
--    level except Member) see and use it as before.
-- 2. Daily question count. assistant_usage keeps how many questions each
--    person asked the assistant per day (Philippine date).
--    count_assistant_question() adds one for the signed-in person and
--    returns the new total; the app enforces the limit for Members.
--    Nobody can change or delete these counts directly.
-- =====================================================================

begin;

set local search_path = public, extensions;

-- ---------------------------------------------------------------------
-- 1. Staff-only documents
-- ---------------------------------------------------------------------
alter table public.chatbot_documents add column if not exists staff_only boolean not null default false;
alter table public.knowledge_chunks  add column if not exists staff_only boolean not null default false;

-- Members no longer read staff-only documents (was: own church, db/003).
drop policy if exists "chatbot_documents_select" on public.chatbot_documents;
create policy "chatbot_documents_select"
  on public.chatbot_documents for select to authenticated
  using (
    (public.get_my_role() in ('admin', 'pastor') or church_id = public.get_my_church_id())
    and (not staff_only or coalesce(public.get_my_role(), 'member') <> 'member')
  );

drop policy if exists "knowledge read" on public.knowledge_chunks;
create policy "knowledge read"
  on public.knowledge_chunks for select to authenticated
  using (
    public.get_my_role() is not null
    and (not staff_only or public.get_my_role() <> 'member')
    and (
      (source_type = 'document' and (public.get_my_role() in ('admin', 'pastor') or church_id = public.get_my_church_id()))
      or (source_type = 'handout' and public.can_see_module(module_id))
    )
  );

-- Keep the index in step: on/off and staff-only follow the document.
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
  if new.is_active is distinct from old.is_active or new.staff_only is distinct from old.staff_only then
    update knowledge_chunks
       set is_active = coalesce(new.is_active, true), staff_only = coalesce(new.staff_only, false)
     where source_type = 'document' and source_id = new.id::text;
  end if;
  return new;
end;
$$;

-- Copy the flag onto index rows written by the app.
create or replace function public.knowledge_chunk_staff_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_type = 'document' then
    select coalesce(staff_only, false) into new.staff_only
    from chatbot_documents where id::text = new.source_id;
    new.staff_only := coalesce(new.staff_only, false);
  else
    new.staff_only := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_knowledge_chunk_staff_only on public.knowledge_chunks;
create trigger trg_knowledge_chunk_staff_only
  before insert on public.knowledge_chunks
  for each row execute function public.knowledge_chunk_staff_only();

-- Search skips staff-only passages for members.
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

-- The spell-check word list skips staff-only documents for members too.
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
    where is_active and not staff_only
  $q$) s
  where public.get_my_role() is not null
    and length(s.word) between 3 and 30
    and s.word ~ '^[a-z]+$';
$$;

-- ---------------------------------------------------------------------
-- 2. Daily question count
-- ---------------------------------------------------------------------
create table if not exists public.assistant_usage (
  user_id   uuid not null references auth.users (id) on delete cascade,
  day       date not null,
  questions integer not null default 0,
  primary key (user_id, day)
);

alter table public.assistant_usage enable row level security;

drop policy if exists "assistant usage read own" on public.assistant_usage;
create policy "assistant usage read own"
  on public.assistant_usage for select to authenticated
  using (user_id = auth.uid());

revoke all on public.assistant_usage from anon, public;
grant select on public.assistant_usage to authenticated;

-- Add one question for the signed-in person today; returns today's total.
create or replace function public.count_assistant_question()
returns integer
language sql
security definer
set search_path = public
as $$
  insert into assistant_usage (user_id, day, questions)
  values (auth.uid(), (now() at time zone 'Asia/Manila')::date, 1)
  on conflict (user_id, day) do update set questions = assistant_usage.questions + 1
  returning questions;
$$;

-- Today's total without adding one.
create or replace function public.my_assistant_questions_today()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select questions from assistant_usage
    where user_id = auth.uid() and day = (now() at time zone 'Asia/Manila')::date
  ), 0);
$$;

revoke all on function public.count_assistant_question(), public.my_assistant_questions_today() from anon, public;
grant execute on function public.count_assistant_question(), public.my_assistant_questions_today() to authenticated;

commit;
