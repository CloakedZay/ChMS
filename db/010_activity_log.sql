-- =====================================================================
-- 010 — Activity log (part 6a): record who changed what, and when
--
-- Run in Supabase → SQL Editor, after 009. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Adds public.activity_log, written only by database triggers, so the app
-- can't skip or fake an entry and nobody can edit or delete one.
-- Logged tables: members, transactions, profiles, events, ministries,
-- discipleship_modules, discipleship_questions, module_handouts,
-- chatbot_documents. (bible_verses is left out: one PDF upload adds
-- hundreds of rows.)
--
-- Who reads it:
--   pastor → everything, every branch
--   admin  → everything except finance entries (Admin has no finance)
--   others → nothing
--
-- A logging error never blocks the change itself; it only skips the entry.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- The log table
-- ---------------------------------------------------------------------
create table if not exists public.activity_log (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  actor_id     uuid,        -- who did it (null = SQL Editor / system)
  actor_role   text,        -- their level at the time
  action       text not null,  -- added, changed, archived, restored, voided, deleted
  table_name   text not null,
  record_id    text,
  record_label text,        -- name / title of the record, for display
  church_id    uuid,
  changes      jsonb        -- on change: { field: { from, to } }
);

create index if not exists activity_log_created_at_idx on public.activity_log (created_at desc);
create index if not exists activity_log_actor_idx      on public.activity_log (actor_id);

alter table public.activity_log enable row level security;

-- Read only. No insert / update / delete rules: only the trigger writes.
drop policy if exists "admin pastor read activity" on public.activity_log;
create policy "admin pastor read activity"
  on public.activity_log for select to authenticated
  using (
    public.get_my_role() = 'pastor'
    or (public.get_my_role() = 'admin' and table_name <> 'transactions')
  );

-- ---------------------------------------------------------------------
-- The trigger function. Generic: works on any table by reading the row
-- as JSON, so no column names are hard-coded except the optional ones
-- used for the label and church.
-- ---------------------------------------------------------------------
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n    jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  o    jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  r    jsonb := coalesce(n, o);
  diff jsonb;
  act  text;
begin
  begin
    if tg_op = 'UPDATE' then
      select jsonb_object_agg(key, jsonb_build_object('from', o -> key, 'to', value))
        into diff
        from jsonb_each(n)
       where key <> 'updated_at'
         and value is distinct from o -> key;
      if diff is null then
        return null;  -- nothing really changed
      end if;

      act := case
        when n ->> 'status' = 'archived' and o ->> 'status' is distinct from 'archived' then 'archived'
        when o ->> 'status' = 'archived' and n ->> 'status' is distinct from 'archived' then 'restored'
        when n ->> 'status' = 'Void'     and o ->> 'status' is distinct from 'Void'     then 'voided'
        else 'changed'
      end;
    elsif tg_op = 'INSERT' then
      act := 'added';
    else
      act := 'deleted';
    end if;

    insert into public.activity_log
      (actor_id, actor_role, action, table_name, record_id, record_label, church_id, changes)
    values (
      auth.uid(),
      case when auth.uid() is not null then public.get_my_role() end,
      act,
      tg_table_name,
      r ->> 'id',
      left(coalesce(r ->> 'full_name', r ->> 'title', r ->> 'file_name',
                    r ->> 'question', r ->> 'description', r ->> 'email'), 200),
      case when r ->> 'church_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then (r ->> 'church_id')::uuid end,
      diff
    );
  exception when others then
    raise warning 'activity log skipped for %: %', tg_table_name, sqlerrm;
  end;
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Attach to each logged table
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'members', 'transactions', 'profiles', 'events', 'ministries',
    'discipleship_modules', 'discipleship_questions', 'module_handouts',
    'chatbot_documents'
  ] loop
    execute format('drop trigger if exists trg_log_activity on public.%I', t);
    execute format(
      'create trigger trg_log_activity after insert or update or delete on public.%I
         for each row execute function public.log_activity()', t);
  end loop;
end;
$$;

commit;

-- =====================================================================
-- Verify (run after commit). Expect: 9 'trigger' rows (one per logged
-- table), the policy "admin pastor read activity", and 'log rows' = 0.
--
-- select 'trigger' as kind, event_object_table as name, string_agg(event_manipulation, ',') as info
-- from information_schema.triggers
-- where trigger_name = 'trg_log_activity' group by event_object_table
-- union all
-- select 'policy', policyname, cmd::text from pg_policies where tablename = 'activity_log'
-- union all
-- select 'zcount', 'log rows', count(*)::text from public.activity_log
-- order by 1, 2;
-- =====================================================================
