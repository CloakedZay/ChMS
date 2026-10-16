-- =====================================================================
-- 069 — Ledger and members load one page at a time
--
-- Run in Supabase → SQL Editor, after 068. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- The Finance and Members pages used to download every row and add up,
-- search and split them into pages in the browser. Supabase hands back at
-- most 1,000 rows per request, so past 1,000 ledger entries the balance
-- and fund totals would have quietly come out wrong (and members past
-- 1,000 would be missing). Now the database does that work and the pages
-- ask for one page of rows plus the totals.
--
-- Everything here runs as the signed-in person (security invoker), so the
-- same row rules decide what each level sees as before: Finance, Leaders
-- and the Pastor see the ledger of their branch (the Pastor every branch);
-- Leaders, the Secretary and the Pastor see members the same way.
--
--   finance_summary(branch)              income and expense per fund
--   ledger_entries(branch, type, search) the ledger, filtered
--   member_rows                          members + ministries + login
--   member_list(branch, status, search)  member_rows, filtered
--   member_counts(branch)                Total / Active / Busy / Inactive
--
-- branch = null means every branch the person can see.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------

-- Money in and out per fund; voided entries never count (lib/financeTotals.js).
-- The page adds the rows up for the Total Balance / Income / Expenses cards.
create or replace function public.finance_summary(p_church uuid default null)
returns table (fund text, income numeric, expense numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select t.fund,
         coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
         coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)
  from transactions t
  where t.status is distinct from 'Void'
    and (p_church is null or t.church_id = p_church)
  group by t.fund
$$;

-- The ledger with the page's filters. The page sorts and picks the rows
-- of one page (order + range), and asks for the total count.
-- Search: category, member / payee, fund or notes containing the words,
-- ignoring case.
create or replace function public.ledger_entries(
  p_church uuid default null,
  p_type   text default null,
  p_search text default null
)
returns setof public.transactions
language sql
stable
security invoker
set search_path = public
as $$
  select t.*
  from transactions t
  where (p_church is null or t.church_id = p_church)
    and (p_type is null or t.type = p_type)
    and (coalesce(p_search, '') = ''
         or strpos(lower(concat_ws(chr(1), t.category, t.member, t.fund, t.notes)), lower(p_search)) > 0)
$$;

-- ---------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------

-- One row per member with what the Members page shows next to it:
-- active ministries ("Choir, Youth"), the linked login (its level is the
-- member's role, db/059) and whether that login is an attendance helper.
drop view if exists public.member_rows cascade;
create view public.member_rows
with (security_invoker = true)
as
select m.*,
       (select string_agg(mi.name, ', ' order by mi.name)
          from ministry_assignments a
          join ministries mi on mi.id = a.ministry_id
         where a.member_id = m.id and mi.is_active) as ministries,
       p.email    as login_email,
       p.role     as login_role,
       p.disabled as login_disabled,
       (m.profile_id is not null
        and exists (select 1 from attendance_helpers h where h.profile_id = m.profile_id)) as is_helper
from members m
left join profiles p on p.id = m.profile_id;

-- Members with the page's filters. p_status 'all' = everyone not archived.
-- Search: name, email, role or ministry containing the words, or a phone
-- number containing the digits typed (3 or more), so "0917 123" finds
-- "09171234567".
create or replace function public.member_list(
  p_church uuid default null,
  p_status text default 'all',
  p_search text default null
)
returns setof public.member_rows
language sql
stable
security invoker
set search_path = public
as $$
  select r.*
  from member_rows r
  where (p_church is null or r.church_id = p_church)
    and (case when coalesce(p_status, 'all') = 'all' then r.status is distinct from 'archived'
              else r.status = p_status end)
    and (coalesce(trim(p_search), '') = ''
         or strpos(lower(concat_ws(chr(1), r.full_name, r.email, coalesce(r.login_role, r.role), r.ministries)),
                   lower(trim(p_search))) > 0
         or (length(regexp_replace(p_search, '\D', '', 'g')) >= 3
             and strpos(regexp_replace(coalesce(r.phone, ''), '\D', '', 'g'),
                        regexp_replace(p_search, '\D', '', 'g')) > 0))
$$;

-- The four summary cards. Archived members count nowhere.
create or replace function public.member_counts(p_church uuid default null)
returns table (total bigint, active bigint, busy bigint, inactive bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select count(*) filter (where m.status is distinct from 'archived'),
         count(*) filter (where m.status = 'active'),
         count(*) filter (where m.status = 'busy'),
         count(*) filter (where m.status = 'inactive')
  from members m
  where p_church is null or m.church_id = p_church
$$;

-- ---------------------------------------------------------------------
-- Signed-in logins only (db/068)
-- ---------------------------------------------------------------------
revoke all on public.member_rows from anon, public;
grant select on public.member_rows to authenticated;

revoke all on function public.finance_summary(uuid)            from anon, public;
revoke all on function public.ledger_entries(uuid, text, text) from anon, public;
revoke all on function public.member_list(uuid, text, text)    from anon, public;
revoke all on function public.member_counts(uuid)              from anon, public;
grant execute on function public.finance_summary(uuid)            to authenticated;
grant execute on function public.ledger_entries(uuid, text, text) to authenticated;
grant execute on function public.member_list(uuid, text, text)    to authenticated;
grant execute on function public.member_counts(uuid)              to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 5 rows.
--
-- select routine_name from information_schema.routines
-- where routine_schema = 'public'
--   and routine_name in ('finance_summary', 'ledger_entries', 'member_list', 'member_counts')
-- union all
-- select table_name from information_schema.views
-- where table_schema = 'public' and table_name = 'member_rows';
-- =====================================================================
