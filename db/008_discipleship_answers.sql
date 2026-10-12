-- =====================================================================
-- 008 — Discipleship answers: members can't approve their own
--
-- Run in Supabase → SQL Editor, after 007. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Before: a member could set their own answer to 'approved' (update and
--         insert rules didn't limit the status); admin could review;
--         church_id was never filled in, so leaders saw no answers.
-- After:
--   member  → submit / rewrite own pending or rejected answers; always
--             saved as 'pending'; can't touch review fields or church;
--             approved answers are locked
--   pastor  → review any answer
--   leader  → review answers from own church
--   admin   → view only (read rule unchanged)
--   nobody reviews their own answers; the database records who reviewed
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- One-time fix: fill in the church on existing answers from the
-- member's profile (runs before the trigger below exists).
-- ---------------------------------------------------------------------
update public.discipleship_progress dp
set church_id = p.church_id
from public.profiles p
where p.id = dp.member_id
  and dp.church_id is null;

-- ---------------------------------------------------------------------
-- Guard trigger. A reviewer (pastor/leader, not their own answer) can
-- only change status and notes; the database stamps reviewed_by/_at.
-- Anyone else working on their own answer gets it saved as 'pending'
-- with their church, and can't change the review fields.
-- auth.uid() is null in the SQL Editor, so fixes from here still work.
-- ---------------------------------------------------------------------
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

drop trigger if exists trg_guard_discipleship_progress on public.discipleship_progress;
create trigger trg_guard_discipleship_progress
  before insert or update on public.discipleship_progress
  for each row execute function public.guard_discipleship_progress();

-- ---------------------------------------------------------------------
-- Member rules: own answers only (the trigger handles the status).
-- "Members can view own progress" (read) is unchanged.
-- ---------------------------------------------------------------------
drop policy if exists "Members can insert own answers" on public.discipleship_progress;
drop policy if exists "members submit own answers"     on public.discipleship_progress;
create policy "members submit own answers"
  on public.discipleship_progress for insert to authenticated
  with check (auth.uid() = member_id);

drop policy if exists "Members can update own answers" on public.discipleship_progress;
drop policy if exists "members edit own answers"       on public.discipleship_progress;
create policy "members edit own answers"
  on public.discipleship_progress for update to authenticated
  using      (auth.uid() = member_id)
  with check (auth.uid() = member_id);

-- ---------------------------------------------------------------------
-- Review: pastor any church, leader own church, never your own answer.
-- Admin is dropped. "leader admin view progress scoped" (read) is
-- unchanged, so admin still sees answers.
-- ---------------------------------------------------------------------
drop policy if exists "leader admin review progress scoped" on public.discipleship_progress;
drop policy if exists "pastor leader review answers"        on public.discipleship_progress;
create policy "pastor leader review answers"
  on public.discipleship_progress for update to authenticated
  using (
    member_id is distinct from auth.uid()
    and (
      public.get_my_role() = 'pastor'
      or (public.get_my_role() = 'leader' and church_id = public.get_my_church_id())
    )
  )
  with check (
    member_id is distinct from auth.uid()
    and (
      public.get_my_role() = 'pastor'
      or (public.get_my_role() = 'leader' and church_id = public.get_my_church_id())
    )
  );

commit;

-- =====================================================================
-- Verify (run after commit). Expect: policies "members submit own
-- answers", "members edit own answers", "pastor leader review answers"
-- and the two read rules; no 'admin' in any UPDATE row; the trigger
-- trg_guard_discipleship_progress twice (INSERT and UPDATE); and the
-- last row 'answers with no church' = 0 (or a few, if a member's
-- profile has no church).
--
-- select 'policy' as kind, policyname as name, cmd::text as info1, qual as info2, with_check as info3
-- from pg_policies where schemaname = 'public' and tablename = 'discipleship_progress'
-- union all
-- select 'trigger', trigger_name, event_manipulation, action_timing, action_statement
-- from information_schema.triggers
-- where event_object_schema = 'public' and event_object_table = 'discipleship_progress'
-- union all
-- select 'zcount', 'answers with no church', count(*)::text, null, null
-- from public.discipleship_progress where church_id is null
-- order by 1, 2;
-- =====================================================================
