-- =====================================================================
-- 086 — Spending requests removed; receipts go on the ledger entry
--
-- Run in Supabase → SQL Editor, after 085. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- The church doesn't use the ask → approve → release → receipts process
-- (db/017–019, db/054): Finance records each expense straight in the
-- ledger. So:
--
-- 1. No new spending requests. Old requests, their approvals and their
--    receipts stay as history (readable in the SQL Editor); ledger entries
--    a request made stay locked (db/054).
-- 2. transaction_receipts: photos / PDFs of receipts attached to an
--    expense in the ledger. Same private 'receipts' bucket, in a folder
--    tx/<entry id>/ (old request receipts are in <request number>/).
--      add / remove   Finance, own branch, expenses that aren't voided
--      view           whoever sees the entry: Pastor (every branch),
--                     Finance and Leaders (own branch)
--    Admin and Secretary have no finance access, so they see none.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. No new spending requests
-- ---------------------------------------------------------------------
drop policy if exists "submit expense requests" on public.expense_requests;

-- ---------------------------------------------------------------------
-- 2. Receipts on ledger entries
-- ---------------------------------------------------------------------
-- Entry id from a storage path "tx/<uuid>/abc-receipt.jpg"; null for any
-- other path (CASE makes the check run before the cast).
create or replace function public.receipt_transaction_id(path text)
returns uuid
language sql
immutable
as $$
  select case when split_part(path, '/', 1) = 'tx'
               and split_part(path, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(path, '/', 2)::uuid end;
$$;

-- Same people who see the entry (db/005 "view transactions scoped").
create or replace function public.can_view_ledger_receipts(tx uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from transactions t
     where t.id = tx
       and (public.get_my_role() = 'pastor'
            or (public.get_my_role() in ('finance', 'leader') and t.church_id = public.get_my_church_id()))
  );
$$;

-- Finance, own branch, an expense that isn't voided.
create or replace function public.can_edit_ledger_receipts(tx uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from transactions t
     where t.id = tx
       and public.get_my_role() = 'finance'
       and t.church_id = public.get_my_church_id()
       and t.type = 'expense'
       and coalesce(t.status, '') <> 'Void'
  );
$$;

create table if not exists public.transaction_receipts (
  id             bigint generated always as identity primary key,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  file_path      text not null unique,
  file_name      text not null check (length(file_name) between 1 and 200),
  file_size      bigint check (file_size is null or file_size between 1 and 10485760),
  uploaded_by    uuid not null default auth.uid(),
  created_at     timestamptz not null default now(),
  constraint transaction_receipts_path_matches check (public.receipt_transaction_id(file_path) = transaction_id)
);
create index if not exists transaction_receipts_tx_idx on public.transaction_receipts (transaction_id);

alter table public.transaction_receipts enable row level security;

drop policy if exists "read ledger receipts" on public.transaction_receipts;
create policy "read ledger receipts"
  on public.transaction_receipts for select to authenticated
  using (public.can_view_ledger_receipts(transaction_id));

drop policy if exists "add ledger receipts" on public.transaction_receipts;
create policy "add ledger receipts"
  on public.transaction_receipts for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_edit_ledger_receipts(transaction_id));

drop policy if exists "remove ledger receipts" on public.transaction_receipts;
create policy "remove ledger receipts"
  on public.transaction_receipts for delete to authenticated
  using (public.can_edit_ledger_receipts(transaction_id));

-- The files: the same private bucket as before (db/019).
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "read ledger receipt files" on storage.objects;
create policy "read ledger receipt files"
  on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.can_view_ledger_receipts(public.receipt_transaction_id(name)));

drop policy if exists "upload ledger receipt files" on storage.objects;
create policy "upload ledger receipt files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.can_edit_ledger_receipts(public.receipt_transaction_id(name)));

drop policy if exists "delete ledger receipt files" on storage.objects;
create policy "delete ledger receipt files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.can_edit_ledger_receipts(public.receipt_transaction_id(name)));

-- Change log: record receipts too, and keep them from the Admin like the
-- other finance records (db/021).
drop trigger if exists trg_log_activity on public.transaction_receipts;
create trigger trg_log_activity
  after insert or update or delete on public.transaction_receipts
  for each row execute function public.log_activity();

drop policy if exists "admin reads activity" on public.activity_log;
create policy "admin reads activity"
  on public.activity_log for select to authenticated
  using (
    public.get_my_role() = 'admin'
    and table_name not in ('transactions', 'expense_requests', 'expense_approvals',
                           'finance_settings', 'expense_receipts', 'transaction_receipts')
  );

revoke all on function public.can_view_ledger_receipts(uuid) from anon, public;
revoke all on function public.can_edit_ledger_receipts(uuid) from anon, public;
grant execute on function public.can_view_ledger_receipts(uuid) to authenticated;
grant execute on function public.can_edit_ledger_receipts(uuid) to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 3 'table policy' rows, 3 'file
-- policy' rows, and no 'submit expense requests'.
--
-- select 'table policy' as kind, policyname from pg_policies where tablename = 'transaction_receipts'
-- union all
-- select 'file policy', policyname from pg_policies
--  where schemaname = 'storage' and policyname like '%ledger receipt files%'
-- union all
-- select 'old', policyname from pg_policies where policyname = 'submit expense requests';
-- =====================================================================
