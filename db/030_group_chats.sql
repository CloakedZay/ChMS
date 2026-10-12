-- =====================================================================
-- 030 — Group chats
--
-- Run in Supabase → SQL Editor, after 029. Wrapped in a transaction.
--
-- Anyone signed in can create a group and add people from their chat list
-- (db/029: own church, plus every Admin and Pastor). The creator is the
-- group's owner and can rename it, add people and remove people; anyone
-- can leave. If the owner leaves, the longest-standing member becomes the
-- owner; when the last person leaves, the group is deleted.
--
-- Only members can read a group's messages — nobody else, Admin and Pastor
-- included — and a new member sees only messages sent after they joined.
-- Messages can't be edited or deleted.
--
-- Everything that changes a group goes through the functions below; the
-- tables themselves are read-only to the app (except sending a message).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.chat_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) between 1 and 60),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_group_members (
  group_id     uuid not null references public.chat_groups (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  is_owner     boolean not null default false,
  joined_at    timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists chat_group_members_user_idx on public.chat_group_members (user_id);

create table if not exists public.group_messages (
  id         bigint generated always as identity primary key,
  group_id   uuid not null references public.chat_groups (id) on delete cascade,
  sender_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists group_messages_group_idx on public.group_messages (group_id, created_at desc);

-- ---------------------------------------------------------------------
-- Helpers. SECURITY DEFINER so the row-level-security rules below can ask
-- "am I in this group?" without recursing into the members table.
-- ---------------------------------------------------------------------
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from chat_group_members where group_id = gid and user_id = auth.uid());
$$;

create or replace function public.is_group_owner(gid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from chat_group_members where group_id = gid and user_id = auth.uid() and is_owner);
$$;

create or replace function public.group_member_since(gid uuid)
returns timestamptz
language sql stable security definer set search_path = public
as $$
  select joined_at from chat_group_members where group_id = gid and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Row-level security: read your own groups; send as yourself into a group
-- you are in. No other direct writes.
-- ---------------------------------------------------------------------
alter table public.chat_groups        enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.group_messages     enable row level security;

drop policy if exists "groups read mine"          on public.chat_groups;
drop policy if exists "group members read mine"   on public.chat_group_members;
drop policy if exists "group messages read"       on public.group_messages;
drop policy if exists "group messages send"       on public.group_messages;

create policy "groups read mine"
  on public.chat_groups for select to authenticated
  using (public.is_group_member(id));

create policy "group members read mine"
  on public.chat_group_members for select to authenticated
  using (public.is_group_member(group_id));

create policy "group messages read"
  on public.group_messages for select to authenticated
  using (
    public.group_member_since(group_id) is not null
    and created_at >= public.group_member_since(group_id)
  );

create policy "group messages send"
  on public.group_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_group_member(group_id));

revoke all on public.chat_groups, public.chat_group_members, public.group_messages from anon, public;
grant select on public.chat_groups, public.chat_group_members to authenticated;
grant select, insert on public.group_messages to authenticated;

-- ---------------------------------------------------------------------
-- create_chat_group — new group; you become the owner.
-- ---------------------------------------------------------------------
create or replace function public.create_chat_group(group_name text, member_ids uuid[])
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  gid uuid;
  ids uuid[];
begin
  if auth.uid() is null or public.get_my_role() is null then
    raise exception 'Not signed in';
  end if;
  if group_name is null or char_length(trim(group_name)) not between 1 and 60 then
    raise exception 'Give the group a name (up to 60 characters)';
  end if;

  select coalesce(array_agg(distinct u), '{}') into ids
  from unnest(coalesce(member_ids, '{}')) as u
  where u <> auth.uid();

  if coalesce(array_length(ids, 1), 0) < 1 then
    raise exception 'Pick at least one person to add';
  end if;
  if array_length(ids, 1) > 49 then
    raise exception 'A group can have up to 50 people';
  end if;
  if exists (select 1 from unnest(ids) as u where u not in (select id from chat_contacts)) then
    raise exception 'You can only add people from your chat list';
  end if;

  insert into chat_groups (name, created_by) values (trim(group_name), auth.uid()) returning id into gid;
  insert into chat_group_members (group_id, user_id, is_owner) values (gid, auth.uid(), true);
  insert into chat_group_members (group_id, user_id) select gid, u from unnest(ids) as u;
  return gid;
end;
$$;

-- ---------------------------------------------------------------------
-- add_group_members — owner only.
-- ---------------------------------------------------------------------
create or replace function public.add_group_members(gid uuid, member_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  ids uuid[];
begin
  if not public.is_group_owner(gid) then
    raise exception 'Only the group owner can add people';
  end if;

  select coalesce(array_agg(distinct u), '{}') into ids
  from unnest(coalesce(member_ids, '{}')) as u
  where u <> auth.uid();

  if exists (select 1 from unnest(ids) as u where u not in (select id from chat_contacts)) then
    raise exception 'You can only add people from your chat list';
  end if;
  if (select count(*) from chat_group_members where group_id = gid) + coalesce(array_length(ids, 1), 0) > 50 then
    raise exception 'A group can have up to 50 people';
  end if;

  insert into chat_group_members (group_id, user_id)
  select gid, u from unnest(ids) as u
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- remove_group_member — the owner removes someone, or you remove yourself
-- (leave). If the owner leaves, the longest-standing member takes over; if
-- nobody is left, the group is deleted.
-- ---------------------------------------------------------------------
create or replace function public.remove_group_member(gid uuid, member uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  was_owner boolean;
begin
  if member is distinct from auth.uid() and not public.is_group_owner(gid) then
    raise exception 'Only the group owner can remove people';
  end if;

  select is_owner into was_owner from chat_group_members where group_id = gid and user_id = member;
  if was_owner is null then
    return;
  end if;

  delete from chat_group_members where group_id = gid and user_id = member;

  if not exists (select 1 from chat_group_members where group_id = gid) then
    delete from chat_groups where id = gid;
  elsif was_owner then
    update chat_group_members set is_owner = true
     where group_id = gid
       and user_id = (select user_id from chat_group_members where group_id = gid order by joined_at, user_id limit 1);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- rename_chat_group — owner only.
-- ---------------------------------------------------------------------
create or replace function public.rename_chat_group(gid uuid, new_name text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_group_owner(gid) then
    raise exception 'Only the group owner can rename it';
  end if;
  if new_name is null or char_length(trim(new_name)) not between 1 and 60 then
    raise exception 'Give the group a name (up to 60 characters)';
  end if;
  update chat_groups set name = trim(new_name) where id = gid;
end;
$$;

create or replace function public.mark_group_read(gid uuid)
returns void
language sql security definer set search_path = public
as $$
  update chat_group_members set last_read_at = now() where group_id = gid and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- group_members — who is in a group (members only see their own groups).
-- ---------------------------------------------------------------------
create or replace function public.group_members(gid uuid)
returns table (user_id uuid, display_name text, contact_role text, is_owner boolean)
language sql stable security definer set search_path = public
as $$
  select
    gm.user_id,
    coalesce(nullif(trim(p.full_name), ''), mm.full_name, split_part(p.email, '@', 1), 'Former member'),
    p.role,
    gm.is_owner
  from chat_group_members gm
  left join profiles p on p.id = gm.user_id
  left join lateral (select full_name from members where profile_id = gm.user_id limit 1) mm on true
  where gm.group_id = gid
    and public.is_group_member(gid)
  order by gm.is_owner desc, 2;
$$;

-- ---------------------------------------------------------------------
-- my_groups — my groups, latest activity first, with unread counts.
-- ---------------------------------------------------------------------
create or replace function public.my_groups()
returns table (
  group_id         uuid,
  name             text,
  member_count     integer,
  is_owner         boolean,
  last_body        text,
  last_at          timestamptz,
  last_sender_name text,
  last_from_me     boolean,
  unread           integer
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
        and u.created_at > me.last_read_at and u.created_at >= me.joined_at)
  from chat_group_members me
  join chat_groups g on g.id = me.group_id
  left join lateral (
    select body, created_at, sender_id from group_messages
     where group_id = g.id and created_at >= me.joined_at
     order by created_at desc, id desc limit 1
  ) lm on true
  left join profiles p on p.id = lm.sender_id
  left join lateral (select full_name from members where profile_id = lm.sender_id limit 1) mm on true
  where me.user_id = auth.uid()
  order by 6 desc;
$$;

create or replace function public.my_group_unread()
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(count(*), 0)::int
  from chat_group_members me
  join group_messages u on u.group_id = me.group_id
  where me.user_id = auth.uid()
    and u.sender_id <> auth.uid()
    and u.created_at > me.last_read_at
    and u.created_at >= me.joined_at;
$$;

revoke all on function
  public.is_group_member(uuid), public.is_group_owner(uuid), public.group_member_since(uuid),
  public.create_chat_group(text, uuid[]), public.add_group_members(uuid, uuid[]),
  public.remove_group_member(uuid, uuid), public.rename_chat_group(uuid, text),
  public.mark_group_read(uuid), public.group_members(uuid), public.my_groups(), public.my_group_unread()
  from anon, public;
grant execute on function
  public.is_group_member(uuid), public.is_group_owner(uuid), public.group_member_since(uuid),
  public.create_chat_group(text, uuid[]), public.add_group_members(uuid, uuid[]),
  public.remove_group_member(uuid, uuid), public.rename_chat_group(uuid, text),
  public.mark_group_read(uuid), public.group_members(uuid), public.my_groups(), public.my_group_unread()
  to authenticated;

-- Live updates for new group messages (row-level security still decides who
-- receives each one).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.group_messages;
  end if;
exception when duplicate_object then
  null;
end
$$;

commit;
