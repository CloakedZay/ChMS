-- =====================================================================
-- 093 — "Ask to join": two-way registration
--
-- Run in Supabase → SQL Editor, after 092. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Until now only staff could register people (Members page). Now a person
-- can also ask to join from the sign-in page (/join): name, email, phone,
-- branch, and a short note. The request waits for the Secretary of that
-- branch (or the Pastor, any branch) on the Members page, who approves it
-- (a member record is made and, with an email, an invitation is sent —
-- api/members/invite) or declines it.
--
-- Requests are saved by the server (api/join, with the "Verify you are
-- human" check and a limit per email/phone), never directly by visitors,
-- so there is no insert rule here.
-- =====================================================================

begin;

create table if not exists public.join_requests (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  full_name   text not null check (length(trim(full_name)) between 2 and 120),
  email       text check (email is null or length(email) <= 254),
  phone       text check (phone is null or phone ~ '^09[0-9]{9}$'),
  church_id   uuid not null references public.churches (id) on delete cascade,
  note        text check (note is null or length(note) <= 500),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  handled_by  uuid references auth.users (id) on delete set null,
  handled_at  timestamptz,
  member_id   bigint references public.members (id) on delete set null
);

create index if not exists join_requests_pending_idx on public.join_requests (church_id) where status = 'pending';

alter table public.join_requests enable row level security;

-- Who handles a branch's requests: its Secretary, or the Pastor.
create or replace function public.can_handle_join_requests(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_my_role() = 'pastor'
      or (public.get_my_role() = 'secretary' and cid = public.get_my_church_id());
$$;

-- Approve / decline stamps who did it.
create or replace function public.guard_join_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.status is distinct from old.status then
    new.handled_by := auth.uid();
    new.handled_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_join_request on public.join_requests;
create trigger trg_guard_join_request
  before update on public.join_requests
  for each row execute function public.guard_join_request();

drop policy if exists "read join requests" on public.join_requests;
create policy "read join requests"
  on public.join_requests for select to authenticated
  using (public.can_handle_join_requests(church_id));

drop policy if exists "handle join requests" on public.join_requests;
create policy "handle join requests"
  on public.join_requests for update to authenticated
  using      (public.can_handle_join_requests(church_id))
  with check (public.can_handle_join_requests(church_id));

revoke all on public.join_requests from anon, public;
grant select, update on public.join_requests to authenticated;
revoke all on function public.can_handle_join_requests(uuid) from anon, public;
grant execute on function public.can_handle_join_requests(uuid) to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 2 rows.
--
-- select policyname, cmd from pg_policies where tablename = 'join_requests';
-- =====================================================================
