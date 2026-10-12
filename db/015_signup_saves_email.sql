-- =====================================================================
-- 015 — Sign-up saves the email (step E2)
--
-- Run in Supabase → SQL Editor, after 014. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- The sign-up function (handle_new_user, runs when a login is created)
-- saved only the name and the Member level — not the email. So the Users
-- page and the Secretary's "link existing login" list couldn't show who a
-- login belongs to. Now it also saves the email, and takes the name from
-- Google's "name" when there's no "full_name" (Google sign-ins).
--
-- Also fills in the email on existing profiles that don't have one. Each
-- filled-in profile shows up once in the Activity log as a change by
-- "System / SQL Editor".
--
-- Branch (church_id) stays empty for people who sign up themselves; the
-- Admin sets it on the Users page.
-- =====================================================================

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email,
    'member'
  );
  return new;
end;
$$;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is null
  and u.email is not null;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 'saves email' = true and
-- 'profiles without email' = 0.
--
-- select 'saves email' as check_name, (prosrc like '%new.email%')::text as result
-- from pg_proc where proname = 'handle_new_user'
-- union all
-- select 'profiles without email', count(*)::text from public.profiles where email is null
-- order by 1;
-- =====================================================================
