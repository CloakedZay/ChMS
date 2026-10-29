-- =====================================================================
-- 097 — A customizable profile: photo and "About me"
--
-- Run in Supabase → SQL Editor, after 096. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Everyone can now set on My Profile:
--   profiles.avatar_path  a profile photo (storage bucket 'avatars')
--   profiles.bio          a short "About me" (up to 300 characters)
-- (Display name, birthday and texts on/off were already there, db/096.)
--
-- Who sees them: the person themselves, and anyone who may open their
-- profile card in Messages (person_extras(), same rule as person_profile
-- from db/061).
--
-- The 'avatars' bucket is public-read, so the picture loads anywhere
-- without a signed link; file names are random, and each person may only
-- write inside their own folder (their user id).
-- =====================================================================

begin;

alter table public.profiles
  add column if not exists avatar_path text check (avatar_path is null or length(avatar_path) <= 300),
  add column if not exists bio text check (bio is null or length(bio) <= 300);

create or replace function public.person_extras(p_id uuid)
returns table (avatar_path text, bio text)
language sql
stable
security definer
set search_path = public
as $$
  select p.avatar_path, p.bio
  from profiles p
  where p.id = p_id
    and (p_id = auth.uid() or exists (select 1 from public.person_profile(p_id)));
$$;

revoke all on function public.person_extras(uuid) from anon, public;
grant execute on function public.person_extras(uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "upload own avatar" on storage.objects;
create policy "upload own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists "delete own avatar" on storage.objects;
create policy "delete own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

commit;

-- =====================================================================
-- Verify (run after commit). Expect 2 columns and bucket public = true.
--
-- select column_name from information_schema.columns
--  where table_name = 'profiles' and column_name in ('avatar_path', 'bio');
-- select public from storage.buckets where id = 'avatars';
-- =====================================================================
