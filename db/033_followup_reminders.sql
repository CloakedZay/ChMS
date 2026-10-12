-- =====================================================================
-- 033 — Follow-up reminders
--
-- Run in Supabase → SQL Editor, after 032. Wrapped in a transaction.
--
-- followup_due(away_days) — the members the caller should follow up now: in
-- their scope (Pastor: every branch; Leader, Secretary: own branch — the
-- same rule as db/032), not archived, and either
--   * linked to a login and not seen in FaithSync for `away_days` days (or
--     never), or
--   * marked inactive by the Secretary,
-- with no follow-up logged in the last `away_days` days.
--
-- The app uses it for the reminder on the staff Dashboard, the
-- notification bell and the badge on the Follow-up link. Members can't
-- use it: for them it returns nothing.
-- =====================================================================

begin;

create or replace function public.followup_due(away_days integer default 30)
returns table (member_id bigint, full_name text, last_seen timestamptz, member_status text)
language sql
stable
security definer
set search_path = public
as $$
  with seen as (
    select
      m.id,
      m.full_name,
      coalesce(m.status, 'active') as status,
      m.profile_id,
      case when m.profile_id is null then null
           else nullif(greatest(
                  coalesce(u.last_sign_in_at, '-infinity'::timestamptz),
                  coalesce((select max(started_at) from page_visits pv where pv.user_id = m.profile_id), '-infinity'::timestamptz)
                ), '-infinity'::timestamptz) end as last_seen
    from members m
    left join auth.users u on u.id = m.profile_id
    where m.status is distinct from 'archived'
      and public.can_follow_up(m.church_id)
  )
  select s.id, s.full_name, s.last_seen, s.status
  from seen s
  where (
          (s.profile_id is not null and (s.last_seen is null or s.last_seen < now() - make_interval(days => greatest(away_days, 1))))
          or s.status = 'inactive'
        )
    and not exists (
          select 1 from member_followups f
           where f.member_id = s.id
             and f.created_at >= now() - make_interval(days => greatest(away_days, 1))
        )
  order by s.last_seen nulls first, s.full_name;
$$;

revoke all on function public.followup_due(integer) from anon, public;
grant execute on function public.followup_due(integer) to authenticated;

commit;
