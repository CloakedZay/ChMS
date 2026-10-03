-- =====================================================================
-- 004 — Replace the old 'staff' level with 'finance' and 'secretary'
--
-- RUN ONLY AFTER the app code from the same commit is running (it knows
-- the new levels; the old code would send these users to the member
-- dashboard).
--
-- Moves the three test staff accounts, then rewrites every policy that
-- named 'staff', giving each new level the half that matches its job:
--   members, ministry assignments → secretary (finance keeps member view)
--   transactions                  → finance
-- Leader, admin and pastor access is unchanged. Content tables (modules,
-- handouts, chatbot docs, verses) still list 'staff'; nobody has that
-- level after this, and step 4 rewrites those policies anyway.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------
update public.profiles set role = 'finance'
where id = (select id from auth.users where email = 'hernandezralph079@gmail.com');

update public.profiles set role = 'secretary'
where id in (select id from auth.users
             where email in ('branch2@faithsync.com', 'branch3@faithsync.com'));

-- Stop here (and undo everything) if any staff account is left over.
do $$
begin
  if exists (select 1 from public.profiles where role = 'staff') then
    raise exception 'A profile still has role staff; nothing was changed';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- transactions: staff → finance
-- ---------------------------------------------------------------------
drop policy if exists "view transactions scoped" on public.transactions;
create policy "view transactions scoped"
  on public.transactions for select
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() = 'finance' and church_id = public.get_my_church_id())
  );

drop policy if exists "insert transactions scoped" on public.transactions;
create policy "insert transactions scoped"
  on public.transactions for insert
  with check (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() = 'finance' and church_id = public.get_my_church_id())
  );

drop policy if exists "update transactions scoped" on public.transactions;
create policy "update transactions scoped"
  on public.transactions for update
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() = 'finance' and church_id = public.get_my_church_id())
  )
  with check (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() = 'finance' and church_id = public.get_my_church_id())
  );

-- ---------------------------------------------------------------------
-- members: staff → secretary (writes), secretary + finance (read)
-- ---------------------------------------------------------------------
drop policy if exists "view members scoped" on public.members;
create policy "view members scoped"
  on public.members for select
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('secretary', 'finance', 'leader')
        and church_id = public.get_my_church_id())
  );

drop policy if exists "insert members scoped" on public.members;
create policy "insert members scoped"
  on public.members for insert
  with check (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() = 'secretary' and church_id = public.get_my_church_id())
  );

drop policy if exists "update members scoped" on public.members;
create policy "update members scoped"
  on public.members for update
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() = 'secretary' and church_id = public.get_my_church_id())
  )
  with check (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() = 'secretary' and church_id = public.get_my_church_id())
  );

-- ---------------------------------------------------------------------
-- ministry_assignments: staff → secretary
-- ---------------------------------------------------------------------
drop policy if exists "view ministry assignments scoped" on public.ministry_assignments;
create policy "view ministry assignments scoped"
  on public.ministry_assignments for select
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('secretary', 'leader') and church_id = public.get_my_church_id())
  );

drop policy if exists "insert ministry assignments scoped" on public.ministry_assignments;
create policy "insert ministry assignments scoped"
  on public.ministry_assignments for insert
  with check (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('secretary', 'leader') and church_id = public.get_my_church_id())
  );

drop policy if exists "update ministry assignments scoped" on public.ministry_assignments;
create policy "update ministry assignments scoped"
  on public.ministry_assignments for update
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('secretary', 'leader') and church_id = public.get_my_church_id())
  )
  with check (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('secretary', 'leader') and church_id = public.get_my_church_id())
  );

drop policy if exists "delete ministry assignments scoped" on public.ministry_assignments;
create policy "delete ministry assignments scoped"
  on public.ministry_assignments for delete
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('secretary', 'leader') and church_id = public.get_my_church_id())
  );

commit;

-- =====================================================================
-- Verify (run after commit)
-- =====================================================================
-- Levels now in use — expect no 'staff':
-- select role, count(*) from public.profiles group by role order by role;
--
-- Policies that still mention staff — expect only the content tables
-- (discipleship_modules, discipleship_questions, module_handouts,
-- chatbot_documents, bible_verses, storage.objects):
-- select schemaname, tablename, policyname
-- from pg_policies
-- where coalesce(qual, '') || coalesce(with_check, '') like '%staff%'
-- order by schemaname, tablename;
