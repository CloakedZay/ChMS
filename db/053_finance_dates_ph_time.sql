-- =====================================================================
-- 053 — Released requests and returned change use the Philippine date
--
-- Run in Supabase → SQL Editor, after 052. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- When Finance released a spending request, or accepted its receipts
-- with change returned, the ledger entry was dated with current_date —
-- the server's date, which is UTC. Before 8 AM Philippine time that is
-- still yesterday, so the entry showed the day before (and on the 1st,
-- the previous month). Now both entries use today in Asia/Manila, like
-- the birthdays do (db/026).
--
-- guard_expense_request is db/019's otherwise.
-- =====================================================================

begin;

create or replace function public.guard_expense_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  my_role    text := coalesce(public.get_my_role(), '');
  my_church  uuid := public.get_my_church_id();
  lim        numeric;
  tx_id      uuid;
  spent      numeric;
  note_in    text;
  feedback   text;
  got_change boolean;
  ph_today   date := (now() at time zone 'Asia/Manila')::date;
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
      new.church_id := my_church;
    end if;
    new.status      := 'pending';
    new.created_at  := now();
    new.decided_at  := null;
    new.released_at := null;
    new.released_by := null;
    new.transaction_id := null;
    new.spent_amount := null;
    new.liquidation_note := null;
    new.liquidation_submitted_at := null;
    new.liquidation_submitted_by := null;
    new.liquidation_feedback := null;
    new.change_returned := false;
    new.liquidated_at := null;
    new.liquidated_by := null;
    new.change_transaction_id := null;

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

  -- Requester cancels while pending.
  if new.status = 'cancelled' and old.status = 'pending' and old.requested_by = auth.uid() then
    new := old;
    new.status     := 'cancelled';
    new.decided_at := now();
    return new;
  end if;

  -- Finance releases an approved request → expense in the ledger.
  if new.status = 'released' and old.status = 'approved'
     and my_role = 'finance' and old.church_id = my_church then
    insert into transactions
      (type, amount, description, category, fund, member, church_id, notes,
       recorded_by, date, date_recorded, status)
    values (
      'expense', old.amount, old.title,
      case old.category
        when 'Love gift'        then 'Love Gift'
        when 'Ministry expense' then 'Ministry'
        else 'Other'
      end,
      'General Fund', old.requester_name, old.church_id,
      'Spending request #' || old.id || ' (' || old.category || '): ' || old.title,
      auth.uid(), ph_today, ph_today, 'Verified'
    )
    returning id into tx_id;

    new := old;
    new.status         := 'released';
    new.released_at    := now();
    new.released_by    := auth.uid();
    new.transaction_id := tx_id;
    return new;
  end if;

  -- Liquidation submitted: requester or Finance of that branch.
  if new.status = 'liquidating' and old.status = 'released'
     and (old.requested_by = auth.uid() or (my_role = 'finance' and old.church_id = my_church)) then
    spent   := new.spent_amount;
    note_in := new.liquidation_note;
    if spent is null or spent <= 0 then
      raise exception 'Enter the amount actually spent';
    end if;
    if not exists (select 1 from expense_receipts where request_id = old.id) then
      raise exception 'Upload at least one receipt first';
    end if;
    new := old;
    new.status                   := 'liquidating';
    new.spent_amount             := spent;
    new.liquidation_note         := note_in;
    new.liquidation_submitted_at := now();
    new.liquidation_submitted_by := auth.uid();
    new.liquidation_feedback     := null;
    return new;
  end if;

  -- Finance accepts the liquidation.
  if new.status = 'liquidated' and old.status = 'liquidating'
     and my_role = 'finance' and old.church_id = my_church then
    got_change := coalesce(new.change_returned, false) and old.spent_amount < old.amount;
    new := old;
    new.status          := 'liquidated';
    new.liquidated_at   := now();
    new.liquidated_by   := auth.uid();
    new.change_returned := got_change;
    if got_change then
      insert into transactions
        (type, amount, description, category, fund, member, church_id, notes,
         recorded_by, date, date_recorded, status)
      values (
        'income', old.amount - old.spent_amount, 'Change returned: ' || old.title,
        'Other', 'General Fund', old.requester_name, old.church_id,
        'Change returned from spending request #' || old.id,
        auth.uid(), ph_today, ph_today, 'Verified'
      )
      returning id into tx_id;
      new.change_transaction_id := tx_id;
    end if;
    return new;
  end if;

  -- Finance sends it back for correction.
  if new.status = 'released' and old.status = 'liquidating'
     and my_role = 'finance' and old.church_id = my_church then
    feedback := new.liquidation_feedback;
    if feedback is null or length(trim(feedback)) = 0 then
      raise exception 'Say what needs fixing';
    end if;
    new := old;
    new.status               := 'released';
    new.liquidation_feedback := feedback;
    return new;
  end if;

  raise exception 'This change to a spending request is not allowed';
end;
$$;

commit;

-- =====================================================================
-- Verify (run after commit). Expect: 'uses Philippine date' = true and
-- 'no current_date left' = true.
--
-- select 'uses Philippine date' as check_name, (prosrc like '%Asia/Manila%')::text as result
-- from pg_proc where proname = 'guard_expense_request'
-- union all
-- select 'no current_date left', (prosrc not like '%current_date%')::text
-- from pg_proc where proname = 'guard_expense_request';
-- =====================================================================
