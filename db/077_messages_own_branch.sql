-- =====================================================================
-- 077 — Messages: members message only within their own branch
--
-- Run in Supabase → SQL Editor, after 076. Wrapped in a transaction:
-- if any line fails, nothing is applied.
--
-- Until now (db/029) everyone could message people in their own branch
-- plus every Admin and Pastor in any branch. Now:
--   * Admin and Pastor   can still message everyone, in every branch.
--   * Everyone else      only people in their own branch (that includes
--                        their own branch's Admin and Pastor), plus anyone
--                        who has already messaged them — so a member can
--                        still reply when an Admin or Pastor from another
--                        branch writes to them first.
--
-- Only the chat_contacts view changes. Everything that decides who can be
-- messaged, added to a group or looked up already reads it: the "messages
-- send" rule (db/029), create_chat_group / add_group_members (db/030),
-- contact_ministries / person_profile (db/061). Existing chats and groups
-- are not touched.
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
    public.get_my_role() in ('admin', 'pastor')
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
-- Verify (run after commit). Expect 'still_says_any_branch' = false.
-- To see the new rule, sign in as a Member and open Messages → new chat:
-- only people from their own branch are listed.
--
-- select pg_get_viewdef('public.chat_contacts'::regclass) like '%p.role = ANY%'
--        as still_says_any_branch;
-- =====================================================================
