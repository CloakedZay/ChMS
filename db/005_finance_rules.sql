-- =====================================================================
-- 005 — Finance access per the roles doc (step 4a)
--
--   Finance  add + edit, own church        (unchanged)
--   Pastor   view only, every branch       (was add/edit/delete)
--   Leader   view only, own church         (unchanged)
--   Admin    no access                     (was add/edit/delete)
--   Delete   nobody — a wrong entry is marked status 'Void' instead
--   Void     locked: a voided entry can't be edited or un-voided
--
-- Safe to run before or after the matching app code: the old page's
-- Delete button simply stops working, which the new page replaces with
-- a Void button.
-- =====================================================================

begin;

-- Old policies: admin/pastor full access, and the separate leader view.
drop policy if exists "Strict Finance Access"            on public.transactions;
drop policy if exists "leaders view transactions scoped" on public.transactions;

drop policy if exists "view transactions scoped" on public.transactions;
create policy "view transactions scoped"
  on public.transactions for select to authenticated
  using (
    public.get_my_role() = 'pastor'
    or (public.get_my_role() in ('finance', 'leader') and church_id = public.get_my_church_id())
  );

drop policy if exists "insert transactions scoped" on public.transactions;
create policy "insert transactions scoped"
  on public.transactions for insert to authenticated
  with check (public.get_my_role() = 'finance' and church_id = public.get_my_church_id());

drop policy if exists "update transactions scoped" on public.transactions;
create policy "update transactions scoped"
  on public.transactions for update to authenticated
  using      (public.get_my_role() = 'finance' and church_id = public.get_my_church_id())
  with check (public.get_my_role() = 'finance' and church_id = public.get_my_church_id());

-- No delete policy on purpose: nobody can delete a transaction.

-- A voided entry is final. Runs for every update, whoever makes it.
create or replace function public.lock_voided_transactions()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'Void' then
    raise exception 'This entry was voided and can no longer be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_voided_transactions on public.transactions;
create trigger trg_lock_voided_transactions
  before update on public.transactions
  for each row execute function public.lock_voided_transactions();

commit;

-- =====================================================================
-- Verify (run after commit) — expect exactly 3 policies:
-- view (select), insert, update; none for delete and none naming admin:
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'transactions'
-- order by cmd, policyname;
-- =====================================================================
