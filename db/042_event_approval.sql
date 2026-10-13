-- =====================================================================
-- 042 — Event approval: approve / send back, notices, auto-Done
--
-- Run in Supabase → SQL Editor, after 041. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- New events start as 'planning'. A Leader or Ministry Head submits theirs
-- ('pending'); the Pastor approves it or sends it back to planning with a
-- reason. The person who filed it is told either way (review_seen = false
-- until they dismiss the notice). Approved events become 'done' by
-- themselves once their date has passed (attendance can still be taken).
--
-- events.review_note   the Pastor's reason when sending an event back
-- events.reviewed_by   who approved / sent it back, and when (reviewed_at)
-- events.review_seen   false until the person who filed it has seen it
--
-- Only the Pastor sets these (and approved_by); for anyone else the
-- database keeps the old values. An event can't be approved without a date.
-- =====================================================================

begin;

alter table public.events
  add column if not exists review_note text check (review_note is null or length(review_note) <= 1000),
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_seen boolean not null default true;

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

drop trigger if exists events_review_guard on public.events;
create trigger events_review_guard
  before insert or update on public.events
  for each row execute function public.events_review_guard();

-- The person who filed events has seen the Pastor's decision on them
-- (all of their unseen ones, or just p_ids).
create or replace function public.mark_event_reviews_seen(p_ids bigint[] default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform set_config('faithsync.event_review', 'on', true);
  update events set review_seen = true
   where created_by = auth.uid() and not review_seen
     and (p_ids is null or id = any(p_ids));
  perform set_config('faithsync.event_review', 'off', true);
end;
$$;

-- Approved events whose date has passed → done. Called when staff pages
-- load; returns how many changed.
create or replace function public.complete_past_events()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if public.get_my_role() is null then return 0; end if;
  update events e set status = 'done'
   where e.status = 'approved'
     and e.date < public.ph_today();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.mark_event_reviews_seen(bigint[]) from anon, public;
revoke all on function public.complete_past_events()            from anon, public;
grant execute on function public.mark_event_reviews_seen(bigint[]) to authenticated;
grant execute on function public.complete_past_events()            to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 4 columns and 'trigger' = 1.
--
-- select count(*) as columns from information_schema.columns
--  where table_schema = 'public' and table_name = 'events'
--    and column_name in ('review_note', 'reviewed_by', 'reviewed_at', 'review_seen');
-- select count(*) as trigger from pg_trigger where tgname = 'events_review_guard';
-- =====================================================================
