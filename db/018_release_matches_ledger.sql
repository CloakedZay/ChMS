-- =====================================================================
-- 018 — Released spending requests match the ledger (fix to 017)
--
-- Run in Supabase → SQL Editor, after 017. Wrapped in a transaction.
--
-- When Finance releases a request, 017 recorded the expense with the
-- request's category names and only date_recorded. The Finance ledger
-- uses its own expense categories (Love Gift / Ministry / Other) and shows
-- the "date" column. Now the entry uses ledger categories, fills both
-- dates, puts it in the General Fund, and names who it was for.
--   Love gift        → Love Gift
--   Ministry expense → Ministry
--   Reimbursement    → Other   (the note says "Reimbursement")
--   Other            → Other
--
-- Also saves the requester's and each approver's name on the request /
-- approval, because Finance can't read other people's profiles (db/006)
-- and would otherwise see no names in the request list.
-- Apart from that, the same as 017.
-- =====================================================================

begin;

alter table public.expense_requests  add column if not exists requester_name text;
alter table public.expense_approvals add column if not exists approver_name text;

create or replace function public.guard_expense_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  my_role   text := coalesce(public.get_my_role(), '');
  lim       numeric;
  tx_id     uuid;
  for_whom  text;
begin
  if auth.uid() is null then
    return new;  -- SQL Editor
  end if;

  if tg_op = 'INSERT' then
    if my_role not in ('pastor', 'leader') then
      raise exception 'Only the Pastor and Leaders can submit spending requests';
    end if;
    new.requested_by := auth.uid();
    select coalesce(full_name, email) into new.requester_name from profiles where id = auth.uid();
    if my_role <> 'pastor' or new.church_id is null then
      new.church_id := public.get_my_church_id();
    end if;
    new.status      := 'pending';
    new.created_at  := now();
    new.decided_at  := null;
    new.released_at := null;
    new.released_by := null;
    new.transaction_id := null;

    select approval_limit into lim from finance_settings where church_id = new.church_id;
    new.approval_limit := coalesce(lim, 5000);

    if new.category = 'Love gift' or my_role = 'pastor' then
      new.elders_only    := true;
      new.needs_pastor   := false;
      new.required_count := case when new.amount > new.approval_limit then 2 else 1 end;
    elsif new.amount > new.approval_limit then
      new.elders_only    := false;
      new.needs_pastor   := true;
      new.required_count := 2;
    else
      new.elders_only    := false;
      new.needs_pastor   := false;
      new.required_count := 1;
    end if;
    return new;
  end if;

  -- UPDATE: the approval trigger sets this flag for its own status change.
  if current_setting('app.expense_decision', true) = 'on' then
    return new;
  end if;

  if new.status = 'cancelled' and old.status = 'pending' and old.requested_by = auth.uid() then
    new := old;
    new.status     := 'cancelled';
    new.decided_at := now();
    return new;
  end if;

  if new.status = 'released' and old.status = 'approved'
     and my_role = 'finance' and old.church_id = public.get_my_church_id() then
    for_whom := old.requester_name;

    insert into transactions
      (type, amount, description, category, fund, member, church_id, notes,
       recorded_by, date, date_recorded, status)
    values (
      'expense',
      old.amount,
      old.title,
      case old.category
        when 'Love gift'        then 'Love Gift'
        when 'Ministry expense' then 'Ministry'
        else 'Other'
      end,
      'General Fund',
      for_whom,
      old.church_id,
      'Spending request #' || old.id || ' (' || old.category || '): ' || old.title,
      auth.uid(),
      current_date,
      current_date,
      'Verified'
    )
    returning id into tx_id;

    new := old;
    new.status         := 'released';
    new.released_at    := now();
    new.released_by    := auth.uid();
    new.transaction_id := tx_id;
    return new;
  end if;

  raise exception 'This change to a spending request is not allowed';
end;
$$;

create or replace function public.guard_expense_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.approver_id       := auth.uid();
  new.approver_role     := public.get_my_role();
  new.approver_is_elder := public.am_i_elder();
  new.created_at        := now();
  select coalesce(full_name, email) into new.approver_name from profiles where id = auth.uid();
  return new;
end;
$$;

commit;

-- =====================================================================
-- Verify (run after commit). Expect both rows = true.
--
-- select 'uses ledger categories' as check_name, (prosrc like '%Love Gift%')::text as result
-- from pg_proc where proname = 'guard_expense_request'
-- union all
-- select 'name columns', (count(*) = 2)::text
-- from information_schema.columns
-- where table_schema = 'public'
--   and ((table_name = 'expense_requests' and column_name = 'requester_name')
--     or (table_name = 'expense_approvals' and column_name = 'approver_name'));
-- =====================================================================
