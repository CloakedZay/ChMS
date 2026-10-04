-- =====================================================================
-- 022 — Real ministries per branch (step M1)
--
-- Run in Supabase → SQL Editor. Wrapped in a transaction: if any line
-- fails, nothing is applied.
--
-- 1. ministries get a branch (church_id), a head's display name
--    (head_name — the head may not have a login yet; leader_id is their
--    login once they do) and an on/off switch (is_active).
-- 2. The database list is made to match the church's real ministries
--    (decided 2026-10-05). All in Pandi; Branch 2 and 3 start empty.
--      Worship & Arts       → Program & Music Ministry  (Mr. Israel Dadap)
--      Outreach & Missions  → Mission & Evangelism      (Mr. Neator Jose)
--      Training & Life      → Training & Life Ministry  (Ms. Lolita Jose)
--      new                  → Building & Equipment      (Mr. Ariel Dela Peña)
--      new                  → Finance Ministry          (Mr. David Lopez)
--      Youth Ministry       → kept
--      Children's Ministry  → switched off (not deleted)
-- 3. Who sees / changes what:
--      ministries   read: own branch (Admin, Pastor: all); change: Pastor
--      assignments  read: Admin, Pastor all; Leader, Secretary own branch;
--                         a member their own
--                   add / change / remove: Pastor, or the ministry's head
--                   (its leader_id) for their own ministry only
--    The database fills in the branch and who assigned; a member can only
--    be put in a ministry of their own branch, once.
-- 4. Members' typed-in ministry (members.ministry) is copied into real
--    assignments where the name matches ("Youth" → Youth Ministry). The
--    typed column stays for now (step M2 switches the pages over).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------
alter table public.ministries
  add column if not exists church_id uuid references public.churches (id),
  add column if not exists head_name text,
  add column if not exists is_active boolean not null default true;

-- ---------------------------------------------------------------------
-- 2. Match the church's real list (Pandi)
-- ---------------------------------------------------------------------
do $$
declare
  pandi uuid;
begin
  select id into pandi from public.churches where name ilike '%pandi%' limit 1;
  if pandi is null then
    raise exception 'Could not find the Pandi branch in churches';
  end if;

  update public.ministries set church_id = pandi where church_id is null;

  update public.ministries set name = 'Program & Music Ministry', head_name = 'Mr. Israel Dadap'
   where name = 'Worship & Arts' and church_id = pandi;
  update public.ministries set name = 'Mission & Evangelism', head_name = 'Mr. Neator Jose'
   where name = 'Outreach & Missions' and church_id = pandi;
  update public.ministries set name = 'Training & Life Ministry', head_name = 'Ms. Lolita Jose'
   where name = 'Training & Life' and church_id = pandi;
  update public.ministries set is_active = false
   where name ilike 'Children%' and church_id = pandi;

  insert into public.ministries (name, head_name, church_id)
  select v.name, v.head, pandi
  from (values ('Building & Equipment', 'Mr. Ariel Dela Peña'),
               ('Finance Ministry',     'Mr. David Lopez')) as v(name, head)
  where not exists (select 1 from public.ministries m
                    where m.church_id = pandi and lower(m.name) = lower(v.name));
end;
$$;

create unique index if not exists ministries_church_name_key
  on public.ministries (church_id, lower(name));

-- ---------------------------------------------------------------------
-- 3a. Ministries: read own branch; Pastor manages (rule from db/007)
-- ---------------------------------------------------------------------
drop policy if exists "authenticated read ministries" on public.ministries;
drop policy if exists "read ministries scoped" on public.ministries;
create policy "read ministries scoped"
  on public.ministries for select to authenticated
  using (public.get_my_role() in ('admin', 'pastor') or church_id = public.get_my_church_id());

-- ---------------------------------------------------------------------
-- 3b. Assignments
-- ---------------------------------------------------------------------
create unique index if not exists ministry_assignments_ministry_member_key
  on public.ministry_assignments (ministry_id, member_id);

-- Is the signed-in user the head (leader_id) of this ministry?
create or replace function public.is_ministry_head(min_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from ministries
    where id = min_id and leader_id = auth.uid() and public.get_my_role() = 'leader'
  );
$$;

-- Branch comes from the ministry; the member must be of that branch.
create or replace function public.guard_ministry_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  min_church uuid;
  mem_church uuid;
begin
  select church_id into min_church from ministries where id = new.ministry_id;
  select church_id into mem_church from members where id = new.member_id;
  if min_church is null then
    raise exception 'That ministry has no branch';
  end if;
  if mem_church is distinct from min_church then
    raise exception 'A member can only join a ministry of their own branch';
  end if;
  new.church_id := min_church;
  if tg_op = 'INSERT' then
    new.assigned_at := now();
    if auth.uid() is not null then
      new.assigned_by := auth.uid();
    end if;
  else
    new.assigned_at := old.assigned_at;
    new.assigned_by := old.assigned_by;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_ministry_assignment on public.ministry_assignments;
create trigger trg_guard_ministry_assignment
  before insert or update on public.ministry_assignments
  for each row execute function public.guard_ministry_assignment();

drop policy if exists "view ministry assignments scoped"   on public.ministry_assignments;
drop policy if exists "insert ministry assignments scoped" on public.ministry_assignments;
drop policy if exists "update ministry assignments scoped" on public.ministry_assignments;
drop policy if exists "delete ministry assignments scoped" on public.ministry_assignments;
drop policy if exists "read ministry assignments"          on public.ministry_assignments;
drop policy if exists "pastor or head adds assignments"    on public.ministry_assignments;
drop policy if exists "pastor or head changes assignments" on public.ministry_assignments;
drop policy if exists "pastor or head removes assignments" on public.ministry_assignments;

create policy "read ministry assignments"
  on public.ministry_assignments for select to authenticated
  using (
    public.get_my_role() in ('admin', 'pastor')
    or (public.get_my_role() in ('leader', 'secretary') and church_id = public.get_my_church_id())
    or exists (select 1 from public.members m where m.id = member_id and m.profile_id = auth.uid())
  );

create policy "pastor or head adds assignments"
  on public.ministry_assignments for insert to authenticated
  with check (public.get_my_role() = 'pastor' or public.is_ministry_head(ministry_id));

create policy "pastor or head changes assignments"
  on public.ministry_assignments for update to authenticated
  using      (public.get_my_role() = 'pastor' or public.is_ministry_head(ministry_id))
  with check (public.get_my_role() = 'pastor' or public.is_ministry_head(ministry_id));

create policy "pastor or head removes assignments"
  on public.ministry_assignments for delete to authenticated
  using (public.get_my_role() = 'pastor' or public.is_ministry_head(ministry_id));

-- ---------------------------------------------------------------------
-- 4. Copy members' typed-in ministry into real assignments
-- ---------------------------------------------------------------------
insert into public.ministry_assignments (ministry_id, member_id, role)
select mi.id, m.id, 'member'
from public.members m
join public.ministries mi
  on mi.church_id = m.church_id
 and (lower(mi.name) = lower(trim(m.ministry))
      or (lower(trim(m.ministry)) = 'youth' and mi.name = 'Youth Ministry'))
where m.ministry is not null
on conflict (ministry_id, member_id) do nothing;

-- Activity log (db/010) for assignments too.
drop trigger if exists trg_log_activity on public.ministry_assignments;
create trigger trg_log_activity
  after insert or update or delete on public.ministry_assignments
  for each row execute function public.log_activity();

commit;

-- =====================================================================
-- Verify (run after commit). Expect 7 'ministry' rows (6 active, Children's
-- off), all in Pandi, with heads as listed; 'assignments' about 9; 5
-- 'policy' rows (1 ministries read + pastor manage, 4 assignments).
--
-- select 'ministry' as kind, mi.name,
--        coalesce(c.name, '(no branch)') || ' | ' || coalesce(mi.head_name, '(no head)')
--          || ' | ' || case when mi.is_active then 'on' else 'OFF' end
--          || ' | ' || (select count(*) from public.ministry_assignments a where a.ministry_id = mi.id) || ' members' as info
-- from public.ministries mi left join public.churches c on c.id = mi.church_id
-- union all
-- select 'assignments', 'total', count(*)::text from public.ministry_assignments
-- union all
-- select 'policy', tablename || ': ' || policyname, cmd::text
-- from pg_policies where tablename in ('ministries', 'ministry_assignments')
-- order by 1, 2;
-- =====================================================================
