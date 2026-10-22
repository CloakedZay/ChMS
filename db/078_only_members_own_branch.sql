-- =====================================================================
-- 078 — Messages: only the Member level is kept to its own branch
--
-- Run in Supabase → SQL Editor, after 077. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- db/077 kept everyone except Admin and Pastor to their own branch. Now
-- only logins at the Member level are:
--   * Member             people in their own branch (that includes their
--                        own branch's leaders, Admin and Pastor), plus
--                        anyone who has already messaged them — so they
--                        can still reply when someone from another branch
--                        writes to them first.
--   * Everyone else      (Admin, Pastor, Leader / Elder, Secretary,
--                        Finance) can message everyone, in every branch.
--
-- Only the chat_contacts view changes; everything that decides who can be
-- messaged, added to a group or looked up reads it (see db/077).
-- =====================================================================

begin;

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
    public.get_my_role() <> 'member'
    or p.church_id = public.get_my_church_id()
    or exists (
      select 1 from public.messages x
       where x.sender_id = p.id and x.recipient_id = auth.uid()
    )
  );

revoke all on public.chat_contacts from anon, public;
grant select on public.chat_contacts to authenticated;

commit;

-- =====================================================================
-- Verify (run after commit). Expect 'members_only' = true.
-- Then sign in as a Leader / Elder: Messages → new chat lists people from
-- every branch. As a Member: only their own branch.
--
-- select pg_get_viewdef('public.chat_contacts'::regclass) like '%<> ''member''%'
--        as members_only;
-- =====================================================================
