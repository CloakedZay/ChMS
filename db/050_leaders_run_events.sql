-- =====================================================================
-- 050 — Leaders run events; the Ministry Head level is removed
--
-- Run in Supabase → SQL Editor, after 049. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- 1. No more Ministry Head level. Ministry heads are Leaders, so every
--    'ministry_head' login becomes 'leader'. Whoever leads a ministry
--    (ministries.leader_id) still manages its members and training, as a
--    Leader always could. The old Ministry Head rules (db/038) stay in
--    the database but no longer match anyone.
--
-- 2. Events, following how the church plans them:
--      Leader     adds events in their branch — approved on save, since
--                 the Leaders plan them together. Approves or sends back
--                 the Secretary's events, and can edit / delete any event
--                 of their branch.
--      Secretary  adds events in their branch — they wait for a Leader's
--                 approval. Edits / deletes their own until approved.
--      Pastor     views only (every branch), like the Admin.
--    Either may give an event a past date (to record attendance for
--    something that already happened).
--    events_review_guard (db/042, db/049) now trusts Leaders instead of
--    the Pastor: only a Leader sets the review fields, and the person
--    who filed an event is told when a Leader decides on it.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Ministry Heads → Leaders
-- ---------------------------------------------------------------------
update public.profiles set role = 'leader' where role = 'ministry_head';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'pastor', 'leader', 'finance', 'secretary', 'member'));

-- ---------------------------------------------------------------------
-- 2. Who may write events (reading is db/044's "view events scoped")
-- ---------------------------------------------------------------------
drop policy if exists "pastor manage events"          on public.events;
drop policy if exists "leader create events"          on public.events;
drop policy if exists "leader edit own events"        on public.events;
drop policy if exists "ministry head create events"   on public.events;
drop policy if exists "ministry head edit own events" on public.events;
drop policy if exists "leader manage events"          on public.events;
drop policy if exists "secretary create events"       on public.events;
drop policy if exists "secretary edit own events"     on public.events;
drop policy if exists "secretary delete own events"   on public.events;

create policy "leader manage events"
  on public.events for all to authenticated
  using      (public.get_my_role() = 'leader' and church_id = public.get_my_church_id())
  with check (public.get_my_role() = 'leader' and church_id = public.get_my_church_id());

create policy "secretary create events"
  on public.events for insert to authenticated
  with check (
    public.get_my_role() = 'secretary'
    and church_id = public.get_my_church_id()
    and created_by = auth.uid()
    and status in ('planning', 'pending')
  );

create policy "secretary edit own events"
  on public.events for update to authenticated
  using (
    public.get_my_role() = 'secretary'
    and church_id = public.get_my_church_id()
    and created_by = auth.uid()
    and status in ('planning', 'pending')
  )
  with check (
    public.get_my_role() = 'secretary'
    and church_id = public.get_my_church_id()
    and created_by = auth.uid()
    and status in ('planning', 'pending')
  );

create policy "secretary delete own events"
  on public.events for delete to authenticated
  using (
    public.get_my_role() = 'secretary'
    and church_id = public.get_my_church_id()
    and created_by = auth.uid()
    and status in ('planning', 'pending')
  );

-- ---------------------------------------------------------------------
-- 3. Review fields: Leaders decide now (was the Pastor, db/049)
-- ---------------------------------------------------------------------
create or replace function public.events_review_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_leader boolean := coalesce(public.get_my_role(), '') = 'leader';
  trusted   boolean := auth.uid() is null
                       or is_leader
                       or coalesce(current_setting('faithsync.event_review', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not trusted then
      new.review_note := null;
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_seen := true;
      new.approved_by := null;
    end if;
    if new.status = 'approved' and new.date is null then
      raise exception 'Set the event''s date before approving it.';
    end if;
    -- A Leader's own event, approved on save.
    if new.status = 'approved' and is_leader then
      new.approved_by := coalesce(new.approved_by, auth.uid());
    end if;
    return new;
  end if;

  if not trusted then
    new.review_note := old.review_note;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_seen := old.review_seen;
    new.approved_by := old.approved_by;
  end if;

  if new.status = 'approved' and new.status is distinct from old.status and new.date is null then
    raise exception 'Set the event''s date before approving it.';
  end if;

  -- A Leader decided on someone else's event: stamp it and tell them.
  if old.status in ('pending', 'planning') and new.status is distinct from old.status
     and new.status in ('approved', 'planning')
     and new.created_by is not null and new.created_by is distinct from auth.uid()
     and is_leader then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    new.review_seen := false;
    if new.status = 'approved' then
      new.approved_by := auth.uid();
      new.review_note := null;
    end if;
  end if;

  return new;
end;
$$;

commit;

-- =====================================================================
-- Verify (run after commit). Expect ministry_heads = 0, then the events
-- write policies: "leader manage events" (ALL) and the three secretary
-- ones; no "pastor manage events".
--
-- select count(*) as ministry_heads from public.profiles where role = 'ministry_head';
-- select policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename = 'events' order by cmd, policyname;
-- =====================================================================
