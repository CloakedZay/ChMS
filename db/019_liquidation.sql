-- =====================================================================
-- 019 — Receipts and liquidation (step F3)
--
-- Run in Supabase → SQL Editor, after 018. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- After Finance releases a request, the spending is "liquidated": the
-- requester (or Finance for them) uploads receipts and enters what was
-- actually spent; Finance checks it and accepts or sends it back.
--
--   released    → liquidating   requester or Finance (own branch);
--                               needs the amount spent and ≥ 1 receipt
--   liquidating → liquidated    Finance (own branch) accepts; if less was
--                               spent and "change received" is ticked, the
--                               returned change is recorded as income
--   liquidating → released      Finance sends it back with a reason
--
-- Receipts live in a private storage bucket 'receipts', in a folder named
-- after the request number. Seeing them follows the request (requester,
-- Pastor, Leaders and Finance of that branch). Adding or removing them is
-- only possible while the request is "released" (before / after a send-
-- back), by the requester or Finance of that branch. Admin and Secretary
-- have no access. Everything is in the Activity log (not for Admin).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Request: new statuses and liquidation fields
-- ---------------------------------------------------------------------
alter table public.expense_requests drop constraint if exists expense_requests_status_check;
alter table public.expense_requests add constraint expense_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'released', 'cancelled', 'liquidating', 'liquidated'));

alter table public.expense_requests
  add column if not exists spent_amount             numeric(12,2) check (spent_amount > 0),
  add column if not exists liquidation_note         text,
  add column if not exists liquidation_submitted_at timestamptz,
  add column if not exists liquidation_submitted_by uuid,
  add column if not exists liquidation_feedback     text,
  add column if not exists change_returned          boolean not null default false,
  add column if not exists liquidated_at            timestamptz,
  add column if not exists liquidated_by            uuid,
  add column if not exists change_transaction_id    uuid;

-- ---------------------------------------------------------------------
-- Who may see / add receipts for a request (used by the table and the
-- storage rules). SECURITY DEFINER so they work the same everywhere.
-- ---------------------------------------------------------------------
create or replace function public.can_view_expense_request(req_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from expense_requests r
    where r.id = req_id
      and (r.requested_by = auth.uid()
           or public.get_my_role() = 'pastor'
           or (public.get_my_role() in ('leader', 'finance') and r.church_id = public.get_my_church_id()))
  );
$$;

create or replace function public.can_add_receipt(req_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from expense_requests r
    where r.id = req_id
      and r.status = 'released'
      and (r.requested_by = auth.uid()
           or (public.get_my_role() = 'finance' and r.church_id = public.get_my_church_id()))
  );
$$;

-- Request number from a storage path "123/abc-receipt.jpg"; null if the
-- first folder isn't a number (CASE makes the check run before the cast).
create or replace function public.receipt_request_id(path text)
returns bigint
language sql
immutable
as $$
  select case when split_part(path, '/', 1) ~ '^[0-9]{1,18}$'
              then split_part(path, '/', 1)::bigint end;
$$;

-- ---------------------------------------------------------------------
-- Receipts list
-- ---------------------------------------------------------------------
create table if not exists public.expense_receipts (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  request_id    bigint not null references public.expense_requests (id) on delete cascade,
  file_path     text not null unique,
  file_name     text not null,
  file_size     bigint,
  uploaded_by   uuid not null default auth.uid(),
  uploader_name text
);

create index if not exists expense_receipts_request_idx on public.expense_receipts (request_id);

alter table public.expense_receipts enable row level security;

create or replace function public.guard_expense_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.uploaded_by := auth.uid();
    new.created_at  := now();
    select coalesce(full_name, email) into new.uploader_name from profiles where id = auth.uid();
    if public.receipt_request_id(new.file_path) is distinct from new.request_id then
      raise exception 'Receipt file must be stored in the request''s folder';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_expense_receipt on public.expense_receipts;
create trigger trg_guard_expense_receipt
  before insert on public.expense_receipts
  for each row execute function public.guard_expense_receipt();

drop policy if exists "read expense receipts" on public.expense_receipts;
create policy "read expense receipts"
  on public.expense_receipts for select to authenticated
  using (public.can_view_expense_request(request_id));

drop policy if exists "add expense receipts" on public.expense_receipts;
create policy "add expense receipts"
  on public.expense_receipts for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_add_receipt(request_id));

drop policy if exists "remove expense receipts" on public.expense_receipts;
create policy "remove expense receipts"
  on public.expense_receipts for delete to authenticated
  using (public.can_add_receipt(request_id));

-- ---------------------------------------------------------------------
-- Private storage bucket for the receipt files
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "read receipt files" on storage.objects;
create policy "read receipt files"
  on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.can_view_expense_request(public.receipt_request_id(name)));

drop policy if exists "upload receipt files" on storage.objects;
create policy "upload receipt files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.can_add_receipt(public.receipt_request_id(name)));

drop policy if exists "delete receipt files" on storage.objects;
create policy "delete receipt files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.can_add_receipt(public.receipt_request_id(name)));

-- ---------------------------------------------------------------------
-- Request guard: same as 018, plus the three liquidation steps.
-- ---------------------------------------------------------------------
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
      auth.uid(), current_date, current_date, 'Verified'
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
        auth.uid(), current_date, current_date, 'Verified'
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

-- ---------------------------------------------------------------------
-- Activity log: receipts too, and keep them from Admin.
-- ---------------------------------------------------------------------
drop trigger if exists trg_log_activity on public.expense_receipts;
create trigger trg_log_activity
  after insert or update or delete on public.expense_receipts
  for each row execute function public.log_activity();

drop policy if exists "admin pastor read activity" on public.activity_log;
create policy "admin pastor read activity"
  on public.activity_log for select to authenticated
  using (
    public.get_my_role() = 'pastor'
    or (public.get_my_role() = 'admin'
        and table_name not in ('transactions', 'expense_requests', 'expense_approvals',
                               'finance_settings', 'expense_receipts'))
  );

commit;

-- =====================================================================
-- Verify (run after commit). Expect: 'receipts bucket' = private,
-- 3 'storage policy' rows, 3 'receipts policy' rows, 'liquidation columns'
-- = 9, and 'guard knows liquidation' = true.
--
-- select 'receipts bucket' as kind, id as name, case when public then 'PUBLIC' else 'private' end as info
-- from storage.buckets where id = 'receipts'
-- union all
-- select 'storage policy', policyname, cmd::text from pg_policies
-- where schemaname = 'storage' and policyname like '%receipt files%'
-- union all
-- select 'receipts policy', policyname, cmd::text from pg_policies where tablename = 'expense_receipts'
-- union all
-- select 'liquidation columns', 'expense_requests', count(*)::text
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'expense_requests'
--   and column_name in ('spent_amount', 'liquidation_note', 'liquidation_submitted_at', 'liquidation_submitted_by',
--                       'liquidation_feedback', 'change_returned', 'liquidated_at', 'liquidated_by', 'change_transaction_id')
-- union all
-- select 'guard knows liquidation', 'guard_expense_request', (prosrc like '%liquidating%')::text
-- from pg_proc where proname = 'guard_expense_request'
-- order by 1, 2;
-- =====================================================================
