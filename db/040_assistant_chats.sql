-- =====================================================================
-- 040 — Saved assistant chats ("New chat" and chat history)
--
-- Run in Supabase → SQL Editor, after 039. Wrapped in a transaction.
--
-- Each person's conversations with the church assistant are saved so they
-- can reopen one and continue it. They are PRIVATE: only the person who had
-- the chat can see, add to, rename or delete it — nobody else, Admin and
-- Pastor included.
--
--   assistant_chats     one row per conversation (title = first question)
--   assistant_messages  the questions and answers in it
-- =====================================================================

begin;

create table if not exists public.assistant_chats (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null default 'New chat' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assistant_chats_user_idx on public.assistant_chats (user_id, updated_at desc);

create table if not exists public.assistant_messages (
  id         bigint generated always as identity primary key,
  chat_id    uuid not null references public.assistant_chats (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null check (char_length(content) between 1 and 8000),
  is_error   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists assistant_messages_chat_idx on public.assistant_messages (chat_id, id);

-- Is this chat the signed-in person's?
create or replace function public.is_my_assistant_chat(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from assistant_chats where id = cid and user_id = auth.uid());
$$;

-- A new message moves its chat to the top of the list.
create or replace function public.touch_assistant_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update assistant_chats set updated_at = now() where id = new.chat_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_assistant_chat on public.assistant_messages;
create trigger trg_touch_assistant_chat
  after insert on public.assistant_messages
  for each row execute function public.touch_assistant_chat();

alter table public.assistant_chats    enable row level security;
alter table public.assistant_messages enable row level security;

drop policy if exists "own chats read"      on public.assistant_chats;
drop policy if exists "own chats add"       on public.assistant_chats;
drop policy if exists "own chats rename"    on public.assistant_chats;
drop policy if exists "own chats delete"    on public.assistant_chats;
drop policy if exists "own chat messages read" on public.assistant_messages;
drop policy if exists "own chat messages add"  on public.assistant_messages;

create policy "own chats read"   on public.assistant_chats for select to authenticated using (user_id = auth.uid());
create policy "own chats add"    on public.assistant_chats for insert to authenticated with check (user_id = auth.uid());
create policy "own chats rename" on public.assistant_chats for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own chats delete" on public.assistant_chats for delete to authenticated using (user_id = auth.uid());

create policy "own chat messages read" on public.assistant_messages for select to authenticated
  using (public.is_my_assistant_chat(chat_id));
create policy "own chat messages add"  on public.assistant_messages for insert to authenticated
  with check (public.is_my_assistant_chat(chat_id));

revoke all on public.assistant_chats, public.assistant_messages from anon, public;
grant select, insert, update, delete on public.assistant_chats to authenticated;
grant select, insert on public.assistant_messages to authenticated;
revoke all on function public.is_my_assistant_chat(uuid) from anon, public;
grant execute on function public.is_my_assistant_chat(uuid) to authenticated;

commit;
