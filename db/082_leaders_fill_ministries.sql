-- =====================================================================
-- 082 — The Pastor picks each ministry's head; the head adds the members
--
-- Run in Supabase → SQL Editor, after 081. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Until now (db/022) the Pastor or the ministry's head could add and
-- remove a ministry's members. Now:
--   * Pastor   adds and edits ministries and picks each one's head
--              (ministries.leader_id), as before — but no longer adds or
--              removes members.
--   * Head     a Leader-level login of the ministry's branch. Only they add
--              and remove that ministry's members.
-- A ministry without a head has nobody to add members until the Pastor
-- picks one. Members already in a ministry stay.
--
-- The head must be a Leader of the ministry's own branch (not disabled);
-- the database refuses anyone else, whatever the app sends.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Only the head adds, changes and removes members
-- ---------------------------------------------------------------------
drop policy if exists "pastor or head adds assignments"    on public.ministry_assignments;
drop policy if exists "pastor or head changes assignments" on public.ministry_assignments;
drop policy if exists "pastor or head removes assignments" on public.ministry_assignments;
drop policy if exists "head adds assignments"              on public.ministry_assignments;
drop policy if exists "head changes assignments"           on public.ministry_assignments;
drop policy if exists "head removes assignments"           on public.ministry_assignments;

create policy "head adds assignments"
  on public.ministry_assignments for insert to authenticated
  with check (public.is_ministry_head(ministry_id));

create policy "head changes assignments"
  on public.ministry_assignments for update to authenticated
  using      (public.is_ministry_head(ministry_id))
  with check (public.is_ministry_head(ministry_id));

create policy "head removes assignments"
  on public.ministry_assignments for delete to authenticated
  using (public.is_ministry_head(ministry_id));

-- ---------------------------------------------------------------------
-- 2. The head must be a Leader of the ministry's branch
-- ---------------------------------------------------------------------
create or replace function public.guard_ministry_head()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.leader_id is not null
     and (tg_op = 'INSERT' or new.leader_id is distinct from old.leader_id
          or new.church_id is distinct from old.church_id)
     and not exists (
       select 1 from profiles p
        where p.id = new.leader_id
          and p.role = 'leader'
          and not coalesce(p.disabled, false)
          and p.church_id = new.church_id
     ) then
    raise exception 'The head must be a Leader of this ministry''s branch.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_ministry_head on public.ministries;
create trigger trg_guard_ministry_head
  before insert or update on public.ministries
  for each row execute function public.guard_ministry_head();

commit;

-- =====================================================================
-- Verify (run after commit). Expect head_rules = 3 and pastor_rules = 0.
-- Then sign in as the Pastor: Ministries shows members but no Add / remove;
-- as the head Leader: Add and remove work for their own ministry.
--
-- select count(*) filter (where policyname like 'head %')        as head_rules,
--        count(*) filter (where policyname like 'pastor or head%') as pastor_rules
--   from pg_policies where tablename = 'ministry_assignments';
-- =====================================================================
