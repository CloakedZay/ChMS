-- =====================================================================
-- 049 — Repeating events, and the Pastor's events start approved
--
-- Run in Supabase → SQL Editor, after 048. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- events.series_id  links the dates of one weekly event (e.g. the Sunday
--                   service). Each date is still its own event with its
--                   own attendance sheet; the app submits, approves,
--                   sends back, edits and deletes them together.
--
-- The Pastor's own events are approved as soon as they are saved (the app
-- sends status 'approved'); the database stamps approved_by. Leaders and
-- Ministry Heads still submit theirs for approval — their insert policies
-- (db/007, db/038) only allow 'planning' / 'pending'.
--
-- events_review_guard is db/042's, plus that stamp.
-- =====================================================================

begin;

alter table public.events add column if not exists series_id uuid;
create index if not exists events_series_idx on public.events (series_id) where series_id is not null;

create or replace function public.events_review_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trusted boolean := auth.uid() is null
                     or coalesce(public.get_my_role(), '') = 'pastor'
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
    -- The Pastor's own event, approved on save.
    if new.status = 'approved' and coalesce(public.get_my_role(), '') = 'pastor' then
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

  -- The Pastor decided on someone else's event: stamp it and tell them.
  if old.status in ('pending', 'planning') and new.status is distinct from old.status
     and new.status in ('approved', 'planning')
     and new.created_by is not null and new.created_by is distinct from auth.uid()
     and coalesce(public.get_my_role(), '') = 'pastor' then
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
-- Verify (run after commit). Expect 1.
--
-- select count(*) as series_column from information_schema.columns
--  where table_schema = 'public' and table_name = 'events' and column_name = 'series_id';
-- =====================================================================
