-- =====================================================================
-- 013 — Disable a login (step 5b)
--
-- Run in Supabase → SQL Editor, after 012. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Adds profiles.disabled. A disabled user's level and branch read as
-- empty to every database rule (get_my_role / get_my_church_id return
-- null), so they lose all level- and branch-based access at once; the app
-- also signs them out. Only an admin can disable or enable someone, and
-- nobody can disable themselves. The SQL Editor can still change anything.
-- =====================================================================

begin;

alter table public.profiles
  add column if not exists disabled boolean not null default false;

-- Same as before, plus "and not disabled".
create or replace function public.get_my_role()
returns text
language sql
security definer
set search_path to 'public'
as $function$
  select role from profiles where id = auth.uid() and not disabled;
$function$;

create or replace function public.get_my_church_id()
returns uuid
language sql
security definer
set search_path to 'public'
as $function$
  select church_id from profiles where id = auth.uid() and not disabled;
$function$;

-- Same as db/009, plus the disabled rules.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (new.role is distinct from old.role
      or new.church_id is distinct from old.church_id
      or new.disabled is distinct from old.disabled)
     and coalesce(public.get_my_role(), '') <> 'admin' then
    raise exception 'Only an admin can change a user''s role, church or access';
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

commit;

-- =====================================================================
-- Verify (run after commit). Expect: 'disabled column' = boolean, all
-- three function rows = true, and 'disabled users' = 0.
--
-- select 'disabled column' as check_name, data_type as result
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'profiles' and column_name = 'disabled'
-- union all
-- select proname, (prosrc like '%disabled%')::text
-- from pg_proc where proname in ('get_my_role', 'get_my_church_id', 'protect_profile_privileges')
-- union all
-- select 'disabled users', count(*)::text from public.profiles where disabled
-- order by 1;
-- =====================================================================
