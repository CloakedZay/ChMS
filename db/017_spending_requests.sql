-- =====================================================================
-- 017 — Spending requests and approvals (step F2)
--
-- Run in Supabase → SQL Editor, after 016. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- A spending request is someone asking for church money before (or, for a
-- reimbursement, after) spending it. It must be approved before Finance
-- releases the money. The database enforces every rule below, so the app
-- can't skip them.
--
-- Who submits:   Pastor, Leaders (incl. Elders)
-- Categories:    Ministry expense, Reimbursement, Love gift, Other
-- Limit:         per branch, default ₱5,000, changed by the Pastor
-- Approvals (never your own request; Finance never approves):
--   up to the limit       → 1 approval: Pastor or any Leader/Elder
--   over the limit        → 2: the Pastor AND one Elder
--   love gift, or the
--   Pastor's own request  → Elders only: 1 Elder (2 Elders over the limit)
--   any one rejection     → rejected
-- Leaders and Elders decide only for their own branch; the Pastor for all.
-- Then:  Finance marks an approved request "Released" → the expense is
--        recorded in the finance ledger automatically.
--        The requester can cancel while it's still pending.
-- Who sees:  requester, Pastor (all), Leaders and Finance (own branch).
--            Admin and Secretary don't (no finance access).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.finance_settings (
  church_id      uuid primary key references public.churches (id) on delete cascade,
  approval_limit numeric(12,2) not null default 5000 check (approval_limit > 0),
  updated_at     timestamptz not null default now()
);

insert into public.finance_settings (church_id)
select id from public.churches
on conflict (church_id) do nothing;

create table if not exists public.expense_requests (
  id               bigint generated always as identity primary key,
  created_at       timestamptz not null default now(),
  church_id        uuid references public.churches (id),
  requested_by     uuid not null default auth.uid(),
  title            text not null check (length(trim(title)) > 0),
  description      text,
  category         text not null check (category in ('Ministry expense', 'Reimbursement', 'Love gift', 'Other')),
  amount           numeric(12,2) not null check (amount > 0),
  status           text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected', 'released', 'cancelled')),
  -- The approval rule, fixed when the request is made:
  approval_limit   numeric(12,2),
  elders_only      boolean not null default false,
  needs_pastor     boolean not null default false,
  required_count   integer not null default 1,
  decided_at       timestamptz,
  released_at      timestamptz,
  released_by      uuid,
  transaction_id   uuid
);

create index if not exists expense_requests_church_idx on public.expense_requests (church_id, status);

create table if not exists public.expense_approvals (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  request_id        bigint not null references public.expense_requests (id) on delete cascade,
  approver_id       uuid not null default auth.uid(),
  approver_role     text,
  approver_is_elder boolean not null default false,
  decision          text not null check (decision in ('approve', 'reject')),
  note              text,
  unique (request_id, approver_id)
);

alter table public.finance_settings  enable row level security;
alter table public.expense_requests  enable row level security;
alter table public.expense_approvals enable row level security;

-- ---------------------------------------------------------------------
-- Request guard: the app supplies title / description / category /
-- amount (and a branch, for the Pastor). Everything else — who, status,
-- the approval rule — comes from the database. After that, only these
-- changes are allowed:
--   requester: pending → cancelled
--   Finance (own branch): approved → released, which records the expense
--   the approval trigger below: pending → approved / rejected
-- ---------------------------------------------------------------------
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
begin
  if auth.uid() is null then
    return new;  -- SQL Editor
  end if;

  if tg_op = 'INSERT' then
    if my_role not in ('pastor', 'leader') then
      raise exception 'Only the Pastor and Leaders can submit spending requests';
    end if;
    new.requested_by := auth.uid();
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
    insert into transactions (type, amount, description, category, church_id, notes, recorded_by, date_recorded)
    values ('expense', old.amount, old.title, old.category, old.church_id,
            'Spending request #' || old.id, auth.uid(), current_date)
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

drop trigger if exists trg_guard_expense_request on public.expense_requests;
create trigger trg_guard_expense_request
  before insert or update on public.expense_requests
  for each row execute function public.guard_expense_request();

-- ---------------------------------------------------------------------
-- Can the signed-in user approve / reject this request right now?
-- ---------------------------------------------------------------------
create or replace function public.can_decide_expense(req_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r       expense_requests%rowtype;
  my_role text := coalesce(public.get_my_role(), '');
  elder   boolean := public.am_i_elder();
begin
  select * into r from expense_requests where id = req_id;
  if not found or r.status <> 'pending' then return false; end if;
  if r.requested_by = auth.uid() then return false; end if;
  if my_role not in ('pastor', 'leader') then return false; end if;
  if my_role = 'leader' and r.church_id is distinct from public.get_my_church_id() then return false; end if;
  if exists (select 1 from expense_approvals where request_id = req_id and approver_id = auth.uid()) then
    return false;
  end if;

  if r.elders_only then
    return elder;
  end if;

  if r.needs_pastor then
    if my_role = 'pastor' then
      return not exists (select 1 from expense_approvals
                         where request_id = req_id and approver_role = 'pastor');
    end if;
    return elder and not exists (select 1 from expense_approvals
                                 where request_id = req_id and approver_is_elder);
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- Approval guard + decision: fill in who, then approve or reject the
-- request once its rule is met.
-- ---------------------------------------------------------------------
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
  return new;
end;
$$;

create or replace function public.apply_expense_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r    expense_requests%rowtype;
  done boolean;
begin
  select * into r from expense_requests where id = new.request_id;

  if new.decision = 'reject' then
    done := true;
  elsif r.elders_only then
    done := (select count(*) from expense_approvals
             where request_id = r.id and decision = 'approve' and approver_is_elder) >= r.required_count;
  elsif r.needs_pastor then
    done := exists (select 1 from expense_approvals where request_id = r.id and decision = 'approve' and approver_role = 'pastor')
        and exists (select 1 from expense_approvals where request_id = r.id and decision = 'approve' and approver_is_elder);
  else
    done := true;
  end if;

  if done then
    perform set_config('app.expense_decision', 'on', true);
    update expense_requests
       set status = case when new.decision = 'reject' then 'rejected' else 'approved' end,
           decided_at = now()
     where id = r.id;
    perform set_config('app.expense_decision', 'off', true);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_guard_expense_approval on public.expense_approvals;
create trigger trg_guard_expense_approval
  before insert on public.expense_approvals
  for each row execute function public.guard_expense_approval();

drop trigger if exists trg_apply_expense_decision on public.expense_approvals;
create trigger trg_apply_expense_decision
  after insert on public.expense_approvals
  for each row execute function public.apply_expense_decision();

-- ---------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------
drop policy if exists "read expense requests" on public.expense_requests;
create policy "read expense requests"
  on public.expense_requests for select to authenticated
  using (
    requested_by = auth.uid()
    or public.get_my_role() = 'pastor'
    or (public.get_my_role() in ('leader', 'finance') and church_id = public.get_my_church_id())
  );

drop policy if exists "submit expense requests" on public.expense_requests;
create policy "submit expense requests"
  on public.expense_requests for insert to authenticated
  with check (public.get_my_role() in ('pastor', 'leader') and requested_by = auth.uid());

drop policy if exists "cancel or release expense requests" on public.expense_requests;
create policy "cancel or release expense requests"
  on public.expense_requests for update to authenticated
  using (
    requested_by = auth.uid()
    or (public.get_my_role() = 'finance' and church_id = public.get_my_church_id())
  );

drop policy if exists "read expense approvals" on public.expense_approvals;
create policy "read expense approvals"
  on public.expense_approvals for select to authenticated
  using (exists (select 1 from public.expense_requests r where r.id = request_id));

drop policy if exists "decide expense requests" on public.expense_approvals;
create policy "decide expense requests"
  on public.expense_approvals for insert to authenticated
  with check (approver_id = auth.uid() and public.can_decide_expense(request_id));

drop policy if exists "read finance settings" on public.finance_settings;
create policy "read finance settings"
  on public.finance_settings for select to authenticated
  using (
    public.get_my_role() = 'pastor'
    or (public.get_my_role() in ('leader', 'finance') and church_id = public.get_my_church_id())
  );

drop policy if exists "pastor sets finance settings" on public.finance_settings;
create policy "pastor sets finance settings"
  on public.finance_settings for update to authenticated
  using (public.get_my_role() = 'pastor')
  with check (public.get_my_role() = 'pastor');

-- ---------------------------------------------------------------------
-- Activity log (db/010): log these too, and keep them from Admin, who
-- has no finance access.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['expense_requests', 'expense_approvals', 'finance_settings'] loop
    execute format('drop trigger if exists trg_log_activity on public.%I', t);
    execute format(
      'create trigger trg_log_activity after insert or update or delete on public.%I
         for each row execute function public.log_activity()', t);
  end loop;
end;
$$;

drop policy if exists "admin pastor read activity" on public.activity_log;
create policy "admin pastor read activity"
  on public.activity_log for select to authenticated
  using (
    public.get_my_role() = 'pastor'
    or (public.get_my_role() = 'admin'
        and table_name not in ('transactions', 'expense_requests', 'expense_approvals', 'finance_settings'))
  );

commit;

-- =====================================================================
-- Verify (run after commit). Expect: 3 'table' rows, 'settings rows' =
-- number of branches (3), 6 'policy' rows on the new tables, 3 'trigger'
-- rows, and 'can_decide_expense' = 1.
--
-- select 'table' as kind, table_name as name, '' as info
-- from information_schema.tables
-- where table_schema = 'public' and table_name in ('finance_settings', 'expense_requests', 'expense_approvals')
-- union all
-- select 'settings rows', 'finance_settings', count(*)::text from public.finance_settings
-- union all
-- select 'policy', tablename || ': ' || policyname, cmd::text
-- from pg_policies where tablename in ('finance_settings', 'expense_requests', 'expense_approvals')
-- union all
-- select 'trigger', trigger_name, string_agg(event_manipulation, ',')
-- from information_schema.triggers
-- where trigger_name in ('trg_guard_expense_request', 'trg_guard_expense_approval', 'trg_apply_expense_decision')
-- group by trigger_name
-- union all
-- select 'function', 'can_decide_expense', count(*)::text from pg_proc where proname = 'can_decide_expense'
-- order by 1, 2;
-- =====================================================================
