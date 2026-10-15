-- =====================================================================
-- 054 — Ledger entries from spending requests are locked; which branches
--       have no Elder
--
-- Run in Supabase → SQL Editor, after 053. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- 1. When Finance releases a request, the expense goes into the ledger
--    (db/018); when receipts are accepted with change returned, so does
--    the change (db/019). Those entries could still be edited or voided
--    afterwards, so the ledger and the request stopped matching. Now
--    nobody can change them; a correction goes through the request
--    (returned change, or a Reimbursement request for overspending).
--
-- 2. branches_without_elder(): the branches where no enabled Leader is
--    marked Elder. Requests over the limit, love gifts and the Pastor's
--    own requests need an Elder, so in those branches they can't be
--    approved — the Spending requests page says so. Only returns
--    something for the Pastor, Leaders and Finance (own branch).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Lock request entries
-- ---------------------------------------------------------------------
create or replace function public.lock_request_transactions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;  -- SQL Editor
  end if;
  if exists (select 1 from expense_requests
             where transaction_id = old.id or change_transaction_id = old.id) then
    raise exception 'This entry comes from a spending request and can''t be changed. Correct it through the request instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_request_transactions on public.transactions;
create trigger trg_lock_request_transactions
  before update on public.transactions
  for each row execute function public.lock_request_transactions();

-- ---------------------------------------------------------------------
-- 2. Branches with no Elder
-- ---------------------------------------------------------------------
create or replace function public.branches_without_elder()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from churches c
  where (public.get_my_role() = 'pastor'
         or (public.get_my_role() in ('leader', 'finance') and c.id = public.get_my_church_id()))
    and not exists (
      select 1 from profiles p
      where p.church_id = c.id and p.role = 'leader' and p.is_elder and not p.disabled
    );
$$;

grant execute on function public.branches_without_elder() to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 'lock trigger' = 1 and
-- 'elder check' = 1.
--
-- select 'lock trigger' as check_name, count(*)::text as result
-- from information_schema.triggers where trigger_name = 'trg_lock_request_transactions'
-- union all
-- select 'elder check', count(*)::text from pg_proc where proname = 'branches_without_elder';
-- =====================================================================
