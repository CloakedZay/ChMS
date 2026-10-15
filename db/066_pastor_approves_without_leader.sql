-- =====================================================================
-- 066 — The Pastor approves events in a branch with no Leader
--
-- Run in Supabase → SQL Editor, after 065. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- The Secretary's events wait for a Leader of their branch (db/050). In a
-- branch with no Leader they waited forever. Now, only there, the Pastor
-- can approve them or send them back, exactly as a Leader would: the
-- Secretary is told, and the card says "Approved by … (Pastor)".
-- Branches that have a Leader are unchanged — the Pastor still only views.
--
--   branches_without_leader()      branches with no enabled Leader
--                                  (Pastor: all; others: their own)
--   pastor_review_events(ids, approve, note)
--                                  approve, or send back with a reason
-- =====================================================================

begin;

create or replace function public.branches_without_leader()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from churches c
  where (public.get_my_role() = 'pastor'
         or (public.get_my_role() is not null and c.id = public.get_my_church_id()))
    and not exists (
      select 1 from profiles p
      where p.church_id = c.id and p.role = 'leader' and not p.disabled
    );
$$;

create or replace function public.pastor_review_events(p_ids bigint[], p_approve boolean, p_note text default null)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ev      events%rowtype;
  changed integer := 0;
begin
  if coalesce(public.get_my_role(), '') <> 'pastor' then
    raise exception 'Only the Pastor can do this.';
  end if;
  if not p_approve and length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'Say what needs changing.';
  end if;

  for ev in select * from events where id = any(p_ids) loop
    if ev.status <> 'pending' then
      raise exception '"%" is not waiting for approval.', ev.title;
    end if;
    if not coalesce(ev.church_id in (select public.branches_without_leader()), false) then
      raise exception '"%" is in a branch with a Leader; the Leaders approve it.', ev.title;
    end if;
    if p_approve and ev.date is null then
      raise exception 'Set the date of "%" before approving it.', ev.title;
    end if;
  end loop;

  perform set_config('faithsync.event_review', 'on', true);
  update events
     set status      = case when p_approve then 'approved' else 'planning' end,
         review_note = case when p_approve then null else btrim(p_note) end,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_seen = (created_by is null or created_by = auth.uid()),
         approved_by = case when p_approve then auth.uid() else approved_by end
   where id = any(p_ids) and status = 'pending';
  get diagnostics changed = row_count;
  perform set_config('faithsync.event_review', 'off', true);
  return changed;
end;
$$;

revoke all on function public.branches_without_leader(), public.pastor_review_events(bigint[], boolean, text) from anon, public;
grant execute on function public.branches_without_leader(), public.pastor_review_events(bigint[], boolean, text) to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 'functions' = 2. The second query
-- lists the branches that have no Leader right now.
--
-- select count(*) as functions from pg_proc
-- where pronamespace = 'public'::regnamespace and proname in ('branches_without_leader', 'pastor_review_events');
--
-- select c.name from churches c
-- where not exists (select 1 from profiles p where p.church_id = c.id and p.role = 'leader' and not p.disabled);
-- =====================================================================
