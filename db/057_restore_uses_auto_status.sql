-- =====================================================================
-- 057 — Restoring a member picks their status automatically
--
-- Run in Supabase → SQL Editor, after 056. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Restoring an archived member always made them Active, even if they
-- hadn't been seen in months. Now restoring uses the same rule as the
-- nightly check (db/056):
--
--   seen in the last 14 days  → Active
--   not seen for 14 days      → Inactive (marked "auto"), and it turns
--                               Active by itself once they're seen again
--
-- member_status_by_hand is db/056's otherwise.
-- =====================================================================

begin;

create or replace function public.member_status_by_hand()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('faithsync.auto_status', true), '') = 'on'
     or new.status is not distinct from old.status then
    return new;
  end if;

  -- Restored from the archive → the automatic rule decides.
  if old.status = 'archived' and new.status is distinct from 'archived' then
    if public.member_last_active(new.id) < now() - interval '14 days' then
      new.status      := 'inactive';
      new.status_auto := true;
    else
      new.status      := 'active';
      new.status_auto := false;
    end if;
    return new;
  end if;

  -- Any other status change by hand is no longer "auto".
  new.status_auto := false;
  return new;
end;
$$;

commit;

-- =====================================================================
-- Verify (run after commit). Expect true.
--
-- select (prosrc like '%Restored from the archive%')::text as updated
-- from pg_proc where proname = 'member_status_by_hand';
-- =====================================================================
