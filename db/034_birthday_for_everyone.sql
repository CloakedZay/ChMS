-- =====================================================================
-- 034 — Everyone can set a birthday, and choose whether it is shown
--
-- Run in Supabase → SQL Editor, after 026 and 028. Wrapped in a
-- transaction.
--
-- Before: only people whose login is linked to a member record could set
-- a birthday (it lives on members.birth_date), and every birthday showed
-- in Upcoming Birthdays.
--
-- Now:
--   * A login with no member record (e.g. Admin, Finance) keeps its
--     birthday on its profile instead (profiles.birth_date).
--   * show_birthday (on both) — "Show my birthday in Upcoming Birthdays".
--     On by default. Off = the birthday is still saved for church records
--     but left out of the widget.
--   * get_my_birthday() / set_my_birthday() work for everyone and use the
--     member record when there is one, otherwise the profile.
--   * upcoming_birthdays lists both, still name + day only (never the
--     year), same branch scoping as before.
-- =====================================================================

begin;

alter table public.members  add column if not exists show_birthday boolean not null default true;
alter table public.profiles add column if not exists birth_date    date;
alter table public.profiles add column if not exists show_birthday boolean not null default true;

-- ---------------------------------------------------------------------
-- My birthday: from my member record if I have one, else my profile.
-- ---------------------------------------------------------------------
drop function if exists public.get_my_birthday();
create function public.get_my_birthday()
returns table (birth_date date, show_birthday boolean, on_member_record boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.birth_date, m.show_birthday, true
  from members m
  where m.profile_id = auth.uid()
  union all
  select p.birth_date, p.show_birthday, false
  from profiles p
  where p.id = auth.uid()
    and not exists (select 1 from members where profile_id = auth.uid())
  limit 1;
$$;

drop function if exists public.set_my_birthday(date);
create or replace function public.set_my_birthday(b date, show boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if b is not null and (b > (now() at time zone 'Asia/Manila')::date or b < date '1900-01-01') then
    raise exception 'That birthday is not a valid date';
  end if;

  if exists (select 1 from members where profile_id = auth.uid()) then
    update members set birth_date = b, show_birthday = coalesce(show, true) where profile_id = auth.uid();
  else
    update profiles set birth_date = b, show_birthday = coalesce(show, true) where id = auth.uid();
  end if;
end;
$$;

revoke all on function public.get_my_birthday()               from anon, public;
revoke all on function public.set_my_birthday(date, boolean)  from anon, public;
grant execute on function public.get_my_birthday()              to authenticated;
grant execute on function public.set_my_birthday(date, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- upcoming_birthdays: member records + logins without one. The id is
-- now text ('m12' / 'p<uuid>') so both kinds fit in one list.
-- ---------------------------------------------------------------------
drop view if exists public.upcoming_birthdays;
create view public.upcoming_birthdays as
with people as (
  select 'm' || m.id::text as id, m.full_name, m.church_id, m.birth_date
  from public.members m
  where m.birth_date is not null
    and m.show_birthday
    and m.status is distinct from 'archived'
  union all
  select 'p' || p.id::text,
         coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)),
         p.church_id, p.birth_date
  from public.profiles p
  where p.birth_date is not null
    and p.show_birthday
    and not p.disabled
    and not exists (select 1 from public.members x where x.profile_id = p.id)
)
select
  pe.id,
  pe.full_name,
  pe.church_id,
  extract(month from pe.birth_date)::int as birth_month,
  extract(day   from pe.birth_date)::int as birth_day,
  (n.next_birthday - n.today)            as days_until
from people pe
cross join lateral (
  select
    (now() at time zone 'Asia/Manila')::date as today,
    case
      when (pe.birth_date + make_interval(years => date_part('year', age((now() at time zone 'Asia/Manila')::date, pe.birth_date))::int))::date
           < (now() at time zone 'Asia/Manila')::date
      then (pe.birth_date + make_interval(years => date_part('year', age((now() at time zone 'Asia/Manila')::date, pe.birth_date))::int + 1))::date
      else (pe.birth_date + make_interval(years => date_part('year', age((now() at time zone 'Asia/Manila')::date, pe.birth_date))::int))::date
    end as next_birthday
) n
where public.get_my_role() in ('admin', 'pastor')
   or pe.church_id = public.get_my_church_id()
   -- a global login with no branch still shows to everyone
   or pe.church_id is null;

revoke all on public.upcoming_birthdays from anon, public;
grant select on public.upcoming_birthdays to authenticated;

commit;
