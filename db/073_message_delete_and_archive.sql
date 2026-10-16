-- =====================================================================
-- 073 — Messages: delete for me / for everyone, delete chat, archive chat
--
-- Run in Supabase → SQL Editor, after 072. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Until now nothing in Messages could be removed. Now, like Messenger:
--
--   Delete for everyone   your own message, any time. The text is wiped
--                         from the database; both sides see "This message
--                         was deleted". (messages / group_messages.deleted_at)
--   Delete for me         any message in your chats; only you stop seeing
--                         it. (message_hides)
--   Delete chat           clears the whole chat for you only; the other
--                         person keeps theirs. It leaves your list until a
--                         new message arrives. (chat_states.cleared_at)
--   Archive chat          moves the chat out of your list for you only;
--                         a new message brings it back. (chat_states.archived_at)
--
-- Everything stays private as before: nobody else (Admin and Pastor
-- included) can read anyone's messages, hides or archive.
-- my_conversations() and my_groups() now leave out what you deleted or
-- cleared, and say whether each chat is archived.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
alter table public.messages       add column if not exists deleted_at timestamptz;
alter table public.group_messages add column if not exists deleted_at timestamptz;

create table if not exists public.message_hides (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('dm', 'group')),
  message_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, message_id)
);

-- One row per person per chat. chat_key is 'dm:<other person>' or
-- 'group:<group id>'.
create table if not exists public.chat_states (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chat_key    text not null check (chat_key ~ '^(dm|group):[0-9a-f-]{36}$'),
  archived_at timestamptz,
  cleared_at  timestamptz,
  primary key (user_id, chat_key)
);

alter table public.message_hides enable row level security;
alter table public.chat_states   enable row level security;

-- Each person reads only their own; changes go through the functions below.
drop policy if exists "message hides read own" on public.message_hides;
create policy "message hides read own" on public.message_hides
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "chat states read own" on public.chat_states;
create policy "chat states read own" on public.chat_states
  for select to authenticated using (user_id = auth.uid());

revoke all on public.message_hides, public.chat_states from anon, public;
grant select on public.message_hides, public.chat_states to authenticated;

-- ---------------------------------------------------------------------
-- Delete for everyone (own messages only)
-- ---------------------------------------------------------------------
create or replace function public.delete_message_for_everyone(p_kind text, p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind = 'dm' then
    update messages set body = 'This message was deleted', deleted_at = now()
     where id = p_id and sender_id = auth.uid() and deleted_at is null;
  elsif p_kind = 'group' then
    update group_messages set body = 'This message was deleted', deleted_at = now()
     where id = p_id and sender_id = auth.uid() and deleted_at is null;
  else
    raise exception 'Unknown kind of message.';
  end if;
  if not found then
    raise exception 'You can only delete your own messages.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Delete for me (any message in my chats)
-- ---------------------------------------------------------------------
create or replace function public.hide_message(p_kind text, p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    (p_kind = 'dm' and exists (select 1 from messages m where m.id = p_id
                                and auth.uid() in (m.sender_id, m.recipient_id)))
    or (p_kind = 'group' and exists (select 1 from group_messages g where g.id = p_id
                                      and public.is_group_member(g.group_id)))
  ) then
    raise exception 'That message is not in your chats.';
  end if;
  insert into message_hides (user_id, kind, message_id) values (auth.uid(), p_kind, p_id)
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- Archive / unarchive a chat, and delete a chat for me
-- ---------------------------------------------------------------------
create or replace function public.set_chat_archived(p_key text, p_on boolean)
returns void
language sql
security definer
set search_path = public
as $$
  insert into chat_states (user_id, chat_key, archived_at)
  values (auth.uid(), p_key, case when p_on then now() end)
  on conflict (user_id, chat_key) do update set archived_at = excluded.archived_at;
$$;

create or replace function public.clear_chat(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  other uuid := substring(p_key from position(':' in p_key) + 1)::uuid;
begin
  insert into chat_states (user_id, chat_key, cleared_at, archived_at)
  values (auth.uid(), p_key, now(), null)
  on conflict (user_id, chat_key) do update set cleared_at = now(), archived_at = null;
  -- Nothing in it is unread any more.
  if p_key like 'dm:%' then
    update messages set read_at = now()
     where recipient_id = auth.uid() and sender_id = other and read_at is null;
  else
    update chat_group_members set last_read_at = now()
     where group_id = other and user_id = auth.uid();
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- My chats: as db/029 and db/030, minus what I deleted or cleared, plus
-- whether I archived it (only until a newer message arrives).
-- The returned columns change, so both are dropped and made again.
-- ---------------------------------------------------------------------
drop function if exists public.my_conversations();

create function public.my_conversations()
returns table (
  other_id      uuid,
  display_name  text,
  contact_role  text,
  last_body     text,
  last_at       timestamptz,
  last_from_me  boolean,
  unread        integer,
  archived      boolean
)
language sql
stable
set search_path = public
as $$
  with st as (
    select chat_key, archived_at, cleared_at from chat_states where user_id = auth.uid()
  ),
  mine as (
    select
      case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end as other_id,
      m.id, m.sender_id, m.recipient_id, m.body, m.created_at, m.read_at
    from messages m
    where (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
      and not exists (select 1 from message_hides h
                       where h.user_id = auth.uid() and h.kind = 'dm' and h.message_id = m.id)
  ),
  visible as (
    select x.* from mine x
    left join st on st.chat_key = 'dm:' || x.other_id
    where st.cleared_at is null or x.created_at > st.cleared_at
  ),
  latest as (
    select distinct on (other_id) other_id, body, created_at, sender_id
    from visible
    order by other_id, created_at desc, id desc
  ),
  unread as (
    select other_id, count(*)::int as n
    from visible
    where recipient_id = auth.uid() and read_at is null
    group by other_id
  )
  select
    l.other_id,
    coalesce(c.display_name, 'Former contact'),
    c.contact_role,
    l.body,
    l.created_at,
    l.sender_id = auth.uid(),
    coalesce(u.n, 0),
    coalesce(st.archived_at >= l.created_at, false)
  from latest l
  left join chat_contacts c on c.id = l.other_id
  left join unread u on u.other_id = l.other_id
  left join st on st.chat_key = 'dm:' || l.other_id
  order by l.created_at desc;
$$;

revoke all on function public.my_conversations() from anon, public;
grant execute on function public.my_conversations() to authenticated;

drop function if exists public.my_groups();

create function public.my_groups()
returns table (
  group_id         uuid,
  name             text,
  member_count     integer,
  is_owner         boolean,
  last_body        text,
  last_at          timestamptz,
  last_sender_name text,
  last_from_me     boolean,
  unread           integer,
  archived         boolean
)
language sql stable security definer set search_path = public
as $$
  select
    g.id,
    g.name,
    (select count(*)::int from chat_group_members x where x.group_id = g.id),
    me.is_owner,
    lm.body,
    coalesce(lm.created_at, g.created_at),
    case when lm.sender_id is null then null
         else coalesce(nullif(trim(p.full_name), ''), mm.full_name, split_part(p.email, '@', 1)) end,
    coalesce(lm.sender_id = auth.uid(), false),
    (select count(*)::int from group_messages u
      where u.group_id = g.id and u.sender_id <> auth.uid()
        and u.created_at > me.last_read_at and u.created_at >= me.joined_at
        and (st.cleared_at is null or u.created_at > st.cleared_at)),
    coalesce(st.archived_at >= coalesce(lm.created_at, g.created_at), false)
  from chat_group_members me
  join chat_groups g on g.id = me.group_id
  left join chat_states st on st.user_id = auth.uid() and st.chat_key = 'group:' || g.id
  left join lateral (
    select gm.body, gm.created_at, gm.sender_id from group_messages gm
     where gm.group_id = g.id and gm.created_at >= me.joined_at
       and (st.cleared_at is null or gm.created_at > st.cleared_at)
       and not exists (select 1 from message_hides h
                        where h.user_id = auth.uid() and h.kind = 'group' and h.message_id = gm.id)
     order by gm.created_at desc, gm.id desc limit 1
  ) lm on true
  left join profiles p on p.id = lm.sender_id
  left join lateral (select full_name from members where profile_id = lm.sender_id limit 1) mm on true
  where me.user_id = auth.uid()
    -- A cleared group leaves the list until someone writes again.
    and (st.cleared_at is null or lm.created_at is not null)
  order by 6 desc;
$$;

revoke all on function public.my_groups() from anon, public;
grant execute on function public.my_groups() to authenticated;

revoke all on function
  public.delete_message_for_everyone(text, bigint), public.hide_message(text, bigint),
  public.set_chat_archived(text, boolean), public.clear_chat(text)
  from anon, public;
grant execute on function
  public.delete_message_for_everyone(text, bigint), public.hide_message(text, bigint),
  public.set_chat_archived(text, boolean), public.clear_chat(text)
  to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 2 rows (the tables) and 4 rows (the
-- functions).
--
-- select table_name from information_schema.tables
-- where table_schema = 'public' and table_name in ('message_hides', 'chat_states');
--
-- select routine_name from information_schema.routines
-- where routine_schema = 'public'
--   and routine_name in ('delete_message_for_everyone', 'hide_message', 'set_chat_archived', 'clear_chat');
-- =====================================================================
