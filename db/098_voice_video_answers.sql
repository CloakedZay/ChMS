-- =====================================================================
-- 098 — Voice or video answers in discipleship
--
-- Run in Supabase → SQL Editor, after 097. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- A member can answer a module's question by recording their voice or a
-- short video (or attaching one) instead of typing; text still works.
--   discipleship_progress.media_path  the recording in the private
--                                     'answer-media' bucket, under the
--                                     member's own folder (their user id)
--   discipleship_progress.media_type  'audio' or 'video'
-- Who can play a recording: whoever can read that answer (the member,
-- and the Pastor and Leaders as today — the subquery below runs under
-- discipleship_progress's own rules). Reviewers can't change it: the
-- guard below keeps the member's recording, like their typed answer.
-- =====================================================================

begin;

alter table public.discipleship_progress
  add column if not exists media_path text check (media_path is null or length(media_path) <= 300),
  add column if not exists media_type text check (media_type is null or media_type in ('audio', 'video'));

-- Same as db/065, plus the recording is the member's, like the answer.
create or replace function public.guard_discipleship_progress()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.get_my_role() in ('pastor', 'leader')
     and new.member_id is distinct from auth.uid() then
    if tg_op = 'UPDATE' then
      new.member_id   := old.member_id;
      new.module_id   := old.module_id;
      new.question_id := old.question_id;
      new.answer      := old.answer;
      new.media_path  := old.media_path;
      new.media_type  := old.media_type;
      new.church_id   := old.church_id;
      if new.status is distinct from old.status then
        new.reviewed_by := auth.uid()::text;
        new.reviewed_at := now();
      else
        new.reviewed_by := old.reviewed_by;
        new.reviewed_at := old.reviewed_at;
      end if;
    end if;
    return new;
  end if;

  if new.media_path is not null and split_part(new.media_path, '/', 1) <> auth.uid()::text then
    raise exception 'The recording must be in your own folder';
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'approved' then
      raise exception 'This answer is already approved and can''t be changed';
    end if;
    new.member_id   := old.member_id;
    new.module_id   := old.module_id;
    new.question_id := old.question_id;
    new.church_id   := coalesce(old.church_id, public.get_my_church_id());
    new.notes       := old.notes;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  else
    new.church_id   := public.get_my_church_id();
    new.notes       := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  new.status     := 'pending';
  new.updated_at := now();
  return new;
end;
$$;

insert into storage.buckets (id, name, public)
values ('answer-media', 'answer-media', false)
on conflict (id) do nothing;

drop policy if exists "read answer recordings" on storage.objects;
create policy "read answer recordings"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'answer-media'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or exists (select 1 from public.discipleship_progress p where p.media_path = name)
    )
  );

drop policy if exists "upload own answer recordings" on storage.objects;
create policy "upload own answer recordings"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'answer-media' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists "delete own answer recordings" on storage.objects;
create policy "delete own answer recordings"
  on storage.objects for delete to authenticated
  using (bucket_id = 'answer-media' and split_part(name, '/', 1) = auth.uid()::text);

commit;

-- =====================================================================
-- Verify (run after commit). Expect 2 columns and 3 storage policies.
--
-- select column_name from information_schema.columns
--  where table_name = 'discipleship_progress' and column_name in ('media_path', 'media_type');
-- select policyname from pg_policies where policyname like '%answer recordings%';
-- =====================================================================
