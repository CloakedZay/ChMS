-- =====================================================================
-- 029 — Messages (one-to-one chat)
--
-- Run in Supabase → SQL Editor. Wrapped in a transaction.
--
-- Anyone signed in can message anyone they are allowed to see in the chat
-- list:
--   * people in their own church (their branch), and
--   * every Admin and Pastor, whichever church they are in.
--   Admin and Pastor can message everyone. Disabled logins are left out.
--
-- A message can be read only by the person who sent it and the person it
-- was sent to — nobody else, Admin and Pastor included. Messages cannot be
-- edited or deleted. The recipient's "read" mark is set through
-- mark_conversation_read(), which touches only messages sent to them.
--
--   chat_contacts        (view)  who I can message: id, display_name, role
--   messages             (table) the messages
--   my_conversations()   (fn)    my chats, latest first, with unread counts
--   mark_conversation_read(other) marks messages from `other` as read
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Who can I message? Runs as its owner so it can list names for people
-- who can't read the profiles / members tables; the WHERE does the scoping.
-- No emails are exposed — just a display name and the access level.
-- ---------------------------------------------------------------------
create or replace view public.chat_contacts as
select
  p.id,
  coalesce(nullif(trim(p.full_name), ''), m.full_name, split_part(p.email, '@', 1)) as display_name,
  p.role                                                                          as contact_role,
  p.church_id
from public.profiles p
left join lateral (
  select full_name from public.members where profile_id = p.id limit 1
) m on true
where not p.disabled
  and p.id <> auth.uid()
  and public.get_my_role() is not null
  and (
    public.get_my_role() in ('admin', 'pastor')
    or p.role in ('admin', 'pastor')
    or p.church_id = public.get_my_church_id()
  );

revoke all on public.chat_contacts from anon, public;
grant select on public.chat_contacts to authenticated;

-- ---------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id           bigint generated always as identity primary key,
  sender_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  body         text not null check (char_length(trim(body)) between 1 and 2000),
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  constraint messages_not_to_self check (sender_id <> recipient_id)
);

create index if not exists messages_pair_idx
  on public.messages (sender_id, recipient_id, created_at desc);
create index if not exists messages_recipient_idx
  on public.messages (recipient_id, sender_id, created_at desc);
create index if not exists messages_unread_idx
  on public.messages (recipient_id) where read_at is null;

alter table public.messages enable row level security;

drop policy if exists "messages read own"   on public.messages;
drop policy if exists "messages send"       on public.messages;

create policy "messages read own"
  on public.messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- Send only as yourself, and only to someone in your chat list.
create policy "messages send"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and read_at is null
    and recipient_id in (select id from public.chat_contacts)
  );

revoke all on public.messages from anon, public;
grant select, insert on public.messages to authenticated;

-- ---------------------------------------------------------------------
-- Marking messages read: only ones sent TO me, only the read mark.
-- ---------------------------------------------------------------------
create or replace function public.mark_conversation_read(other uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update messages
     set read_at = now()
   where recipient_id = auth.uid()
     and sender_id = other
     and read_at is null;
$$;

revoke all on function public.mark_conversation_read(uuid) from anon, public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- My chats, latest first, with the last message and unread count.
-- Runs as the caller, so row-level security keeps it to their own messages.
-- ---------------------------------------------------------------------
create or replace function public.my_conversations()
returns table (
  other_id      uuid,
  display_name  text,
  contact_role  text,
  last_body     text,
  last_at       timestamptz,
  last_from_me  boolean,
  unread        integer
)
language sql
stable
set search_path = public
as $$
  with mine as (
    select
      case when sender_id = auth.uid() then recipient_id else sender_id end as other_id,
      id, sender_id, body, created_at
    from messages
    where sender_id = auth.uid() or recipient_id = auth.uid()
  ),
  latest as (
    select distinct on (other_id) other_id, body, created_at, sender_id
    from mine
    order by other_id, created_at desc, id desc
  ),
  unread as (
    select sender_id as other_id, count(*)::int as n
    from messages
    where recipient_id = auth.uid() and read_at is null
    group by sender_id
  )
  select
    l.other_id,
    coalesce(c.display_name, 'Former contact'),
    c.contact_role,
    l.body,
    l.created_at,
    l.sender_id = auth.uid(),
    coalesce(u.n, 0)
  from latest l
  left join chat_contacts c on c.id = l.other_id
  left join unread u on u.other_id = l.other_id
  order by l.created_at desc;
$$;

revoke all on function public.my_conversations() from anon, public;
grant execute on function public.my_conversations() to authenticated;

-- ---------------------------------------------------------------------
-- Live updates: let Supabase Realtime broadcast new messages (row-level
-- security still decides who receives each one).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
exception when duplicate_object then
  null;   -- already added
end
$$;

commit;
