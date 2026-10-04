-- =====================================================================
-- 021 — Change log is the Admin's (Pastor keeps Screen time only)
--
-- Run in Supabase → SQL Editor. Wrapped in a transaction.
--
-- Decided 2026-10-05: the Activity page's "Changes" tab is the Admin's
-- audit trail. The Pastor sees Screen time only (page_visits, unchanged).
-- Admin still can't see finance records (no finance access), so those
-- changes stay recorded but aren't shown to anyone in the app; they can
-- be read here in the SQL Editor if ever needed.
-- =====================================================================

begin;

drop policy if exists "admin pastor read activity" on public.activity_log;
drop policy if exists "admin reads activity" on public.activity_log;
create policy "admin reads activity"
  on public.activity_log for select to authenticated
  using (
    public.get_my_role() = 'admin'
    and table_name not in ('transactions', 'expense_requests', 'expense_approvals',
                           'finance_settings', 'expense_receipts')
  );

commit;

-- =====================================================================
-- Verify (run after commit). Expect one row: "admin reads activity", and
-- its rule mentions 'admin' but not 'pastor'.
--
-- select policyname, qual from pg_policies where tablename = 'activity_log';
-- =====================================================================
