-- =====================================================================
-- 028 — Members can set their own birthday
--
-- Run in Supabase → SQL Editor, after 026. Wrapped in a transaction.
--
-- Members can't read or edit the members table (db/006), so two small
-- SECURITY DEFINER functions give them exactly one thing: see and change
-- the birthday on THEIR OWN member record — the record whose profile_id is
-- their login. Nothing else on the record can be changed this way, and
-- nobody can touch anyone else's.
--
--   get_my_birthday()      → one row (birth_date) if their login is linked
--                            to a member record, no rows if it isn't
--   set_my_birthday(date)  → saves it (or clears it with null)
-- =====================================================================

begin;

create or replace function public.get_my_birthday()
returns table (birth_date date)
language sql
stable
security definer
set search_path = public
as $$
  select m.birth_date
  from members m
  where m.profile_id = auth.uid()
  limit 1;
$$;

create or replace function public.set_my_birthday(b date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rows_changed int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if b is not null and (b > (now() at time zone 'Asia/Manila')::date or b < date '1900-01-01') then
    raise exception 'That birthday is not a valid date';
  end if;

  update members set birth_date = b where profile_id = auth.uid();
  get diagnostics rows_changed = row_count;
  if rows_changed = 0 then
    raise exception 'Your login is not linked to a member record yet. Ask the Secretary to link it.';
  end if;
end;
$$;

revoke all on function public.get_my_birthday()      from anon, public;
revoke all on function public.set_my_birthday(date) from anon, public;
grant execute on function public.get_my_birthday()      to authenticated;
grant execute on function public.set_my_birthday(date) to authenticated;

commit;
