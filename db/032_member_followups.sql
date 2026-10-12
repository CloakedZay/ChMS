-- =====================================================================
-- 032 — Member inactivity and follow-up
--
-- Run in Supabase → SQL Editor. Wrapped in a transaction.
--
-- 1. member_activity() — every non-archived member with when they were
--    last seen in FaithSync: the later of their last sign-in and their last
--    page visit (db/011), for members whose record is linked to a login.
--    Members without a login can't be measured; has_login tells the app.
--    Also returns their latest follow-up.
-- 2. member_followups — a log of follow-up contacts: who reached out,
--    when, how it went, and a note. Entries are kept as a history; they
--    can't be edited or deleted.
--
-- Who can use it (matches lib/permissions.js, feature "followUp"):
--   Pastor             every branch
--   Leader, Secretary  their own branch
--   Nobody else (members never see who is being followed up).
-- Changing a member's status (active / busy / inactive) is still the
-- Secretary's job, through the normal members rules (db/006).
-- =====================================================================

begin;

create table if not exists public.member_followups (
  id         bigint generated always as identity primary key,
  member_id  bigint not null references public.members (id) on delete cascade,
  church_id  uuid,
  outcome    text not null check (outcome in ('contacted', 'no_answer', 'visited', 'returned', 'not_returning', 'other')),
  note       text check (note is null or char_length(note) <= 2000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists member_followups_member_idx on public.member_followups (member_id, created_at desc);

-- The database fills in the branch (from the member) and who logged it.
create or replace function public.guard_member_followup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select church_id into new.church_id from members where id = new.member_id;
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guard_member_followup on public.member_followups;
create trigger trg_guard_member_followup
  before insert on public.member_followups
  for each row execute function public.guard_member_followup();

create or replace function public.can_follow_up(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.get_my_role() = 'pastor' then true
    when public.get_my_role() in ('leader', 'secretary') then cid is not null and cid = public.get_my_church_id()
    else false
  end;
$$;

alter table public.member_followups enable row level security;

drop policy if exists "followups read"   on public.member_followups;
drop policy if exists "followups insert" on public.member_followups;

create policy "followups read"
  on public.member_followups for select to authenticated
  using (public.can_follow_up(church_id));

-- church_id is set by the trigger before this check runs.
create policy "followups insert"
  on public.member_followups for insert to authenticated
  with check (public.can_follow_up(church_id));

revoke all on public.member_followups from anon, public;
grant select, insert on public.member_followups to authenticated;

-- ---------------------------------------------------------------------
-- member_activity — one row per member the caller may follow up.
-- ---------------------------------------------------------------------
create or replace function public.member_activity()
returns table (
  member_id        bigint,
  full_name        text,
  member_role      text,
  member_status    text,
  church_id        uuid,
  has_login        boolean,
  last_seen        timestamptz,
  followup_count   integer,
  last_followup_at timestamptz,
  last_outcome     text,
  last_note        text,
  last_by          text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.full_name,
    m.role,
    coalesce(m.status, 'active'),
    m.church_id,
    m.profile_id is not null,
    case when m.profile_id is null then null
         else nullif(greatest(
                coalesce(u.last_sign_in_at, '-infinity'::timestamptz),
                coalesce(v.last_visit,      '-infinity'::timestamptz)
              ), '-infinity'::timestamptz) end,
    coalesce(fc.n, 0),
    lf.created_at,
    lf.outcome,
    lf.note,
    coalesce(nullif(trim(bp.full_name), ''), split_part(bp.email, '@', 1))
  from members m
  left join auth.users u on u.id = m.profile_id
  left join lateral (
    select max(started_at) as last_visit from page_visits where user_id = m.profile_id
  ) v on true
  left join lateral (
    select count(*)::int as n from member_followups where member_id = m.id
  ) fc on true
  left join lateral (
    select created_at, outcome, note, created_by from member_followups
     where member_id = m.id order by created_at desc, id desc limit 1
  ) lf on true
  left join profiles bp on bp.id = lf.created_by
  where m.status is distinct from 'archived'
    and public.can_follow_up(m.church_id)
  order by m.full_name;
$$;

-- History for one member, with who logged each entry.
create or replace function public.member_followup_history(mid bigint)
returns table (id bigint, outcome text, note text, created_at timestamptz, by_name text)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.outcome, f.note, f.created_at,
         coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1), 'Unknown')
  from member_followups f
  join members m on m.id = f.member_id
  left join profiles p on p.id = f.created_by
  where f.member_id = mid
    and public.can_follow_up(m.church_id)
  order by f.created_at desc, f.id desc;
$$;

revoke all on function public.can_follow_up(uuid), public.member_activity(), public.member_followup_history(bigint) from anon, public;
grant execute on function public.can_follow_up(uuid), public.member_activity(), public.member_followup_history(bigint) to authenticated;

commit;
