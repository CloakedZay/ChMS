-- =====================================================================
-- 016 — Elder flag (step F1)
--
-- Run in Supabase → SQL Editor, after 015. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Leaders and Elders share the 'leader' level. Spending approvals (F2)
-- need to know who is an Elder: large amounts need the Pastor plus one
-- Elder, and love gifts to the Pastor are approved by Elders only.
--
-- profiles.is_elder  set by the Admin on the Users page; only meaningful
--                    for the leader level — it's cleared automatically if
--                    the person stops being a leader
-- am_i_elder()       true when the signed-in user is an enabled leader
--                    marked as Elder; for the F2 approval rules
-- =====================================================================

begin;

alter table public.profiles
  add column if not exists is_elder boolean not null default false;

-- Same as db/013, plus: only an admin changes is_elder, and is_elder is
-- cleared when someone isn't a leader.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from 'leader' then
    new.is_elder := false;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if (new.role is distinct from old.role
      or new.church_id is distinct from old.church_id
      or new.disabled is distinct from old.disabled
      or new.is_elder is distinct from old.is_elder)
     and coalesce(public.get_my_role(), '') <> 'admin' then
    raise exception 'Only an admin can change a user''s role, church, access or Elder status';
  end if;

  if new.role is distinct from old.role and old.id = auth.uid() then
    raise exception 'You can''t change your own level. Ask another admin.';
  end if;

  if new.disabled is distinct from old.disabled and old.id = auth.uid() then
    raise exception 'You can''t disable your own login. Ask another admin.';
  end if;

  return new;
end;
$$;

create or replace function public.am_i_elder()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_elder from profiles
      where id = auth.uid() and role = 'leader' and not disabled),
    false);
$$;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 'is_elder column' = boolean,
-- 'trigger knows is_elder' = true, 'am_i_elder exists' = 1, 'elders' = 0.
--
-- select 'is_elder column' as check_name, data_type as result
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_elder'
-- union all
-- select 'trigger knows is_elder', (prosrc like '%is_elder%')::text
-- from pg_proc where proname = 'protect_profile_privileges'
-- union all
-- select 'am_i_elder exists', count(*)::text from pg_proc where proname = 'am_i_elder'
-- union all
-- select 'elders', count(*)::text from public.profiles where is_elder
-- order by 1;
-- =====================================================================
