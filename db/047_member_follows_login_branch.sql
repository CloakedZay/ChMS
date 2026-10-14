-- =====================================================================
-- 047 — A member record moves with its login's branch
--
-- Run in Supabase → SQL Editor, after 046. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- The Admin moves people between branches on the Users page, which
-- changes the login (profiles.church_id). The member record linked to it
-- (members.church_id — what the Members page, attendance sheets and
-- Follow-up use) used to stay behind: the person signed in as one branch
-- but was listed in another. Now the record follows.
--
-- Moving to "no branch" leaves the record where it is. Ministry
-- assignments are not changed; the new branch assigns ministries.
--
-- Also fixes records that are already out of step (see the query at the
-- bottom to preview them first).
-- =====================================================================

begin;

create or replace function public.member_follows_login_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.church_id is not null and new.church_id is distinct from old.church_id then
    update members set church_id = new.church_id
     where profile_id = new.id and church_id is distinct from new.church_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_member_follows_login_branch on public.profiles;
create trigger trg_member_follows_login_branch
  after update of church_id on public.profiles
  for each row execute function public.member_follows_login_branch();

-- Records already in a different branch from their login.
update public.members m
   set church_id = p.church_id
  from public.profiles p
 where p.id = m.profile_id
   and p.church_id is not null
   and m.church_id is distinct from p.church_id;

commit;

-- =====================================================================
-- Preview (run BEFORE the script to see what the fix-up will move), or
-- verify (run after: expect no rows).
--
-- select m.id, m.full_name, cm.name as record_branch, cp.name as login_branch
--   from public.members m
--   join public.profiles p on p.id = m.profile_id
--   left join public.churches cm on cm.id = m.church_id
--   left join public.churches cp on cp.id = p.church_id
--  where p.church_id is not null and m.church_id is distinct from p.church_id;
-- =====================================================================
