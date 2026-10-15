-- =====================================================================
-- 061 — Person profiles (tap a name to see who it is)
--
-- Run in Supabase → SQL Editor, after 060. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Messages already lists everyone you can message (chat_contacts, db/029:
-- your own branch, plus every Admin and Pastor) with their name and
-- level. A profile adds, for those same people only:
--   * their branch
--   * the ministries they're in, and which ones they head
-- Nothing else: no phone, email, birthday, status or attendance.
--
--   contact_ministries()   everyone I can message, with their ministries
--                          (also used to search Messages by ministry)
--   person_profile(id)     one person's profile; empty if I can't message
--                          them
-- =====================================================================

begin;

create or replace function public.contact_ministries()
returns table (person_id uuid, ministries jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         coalesce(
           jsonb_agg(jsonb_build_object('name', x.name, 'head', x.head) order by x.head desc, x.name)
             filter (where x.name is not null),
           '[]'::jsonb)
  from chat_contacts c
  left join lateral (
    select mi.name, coalesce(mi.leader_id = c.id, false) as head
    from ministries mi
    where mi.is_active
      and (mi.leader_id = c.id
           or exists (select 1 from ministry_assignments ma
                        join members m on m.id = ma.member_id
                       where ma.ministry_id = mi.id and m.profile_id = c.id))
  ) x on true
  group by c.id;
$$;

create or replace function public.person_profile(p_id uuid)
returns table (
  id           uuid,
  display_name text,
  contact_role text,
  branch       text,
  ministries   jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.display_name, c.contact_role, ch.name,
         coalesce((select cm.ministries from public.contact_ministries() cm where cm.person_id = c.id), '[]'::jsonb)
  from chat_contacts c
  left join churches ch on ch.id = c.church_id
  where c.id = p_id;
$$;

revoke all on function public.contact_ministries(), public.person_profile(uuid) from anon, public;
grant execute on function public.contact_ministries(), public.person_profile(uuid) to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 'functions' = 2.
--
-- select count(*) as functions from pg_proc
-- where pronamespace = 'public'::regnamespace and proname in ('contact_ministries', 'person_profile');
-- =====================================================================
