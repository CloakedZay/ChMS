import { randomInt } from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { Caller } from "@/app/lib/apiAuth";
import { friendlyError } from "@/app/lib/errors";

// SERVER ONLY. Makes a Member-level login for a member record and links it
// (api/members/create-login, api/members/invite). The record is read as the
// caller, so the database rules decide which records they may touch
// (Secretary: own branch; Pastor: any, db/062).

// No look-alike characters (0/O, 1/l/I), so it can be read out or written down.
export function temporaryPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[randomInt(chars.length)];
  return s;
}

export type MemberRow = {
  id: number;
  full_name: string | null;
  email: string | null;
  status: string | null;
  church_id: string | null;
  profile_id: string | null;
};

// The member, or why a login can't be made for them.
export async function memberForLogin(caller: Caller, memberId: unknown): Promise<{ member?: MemberRow; error?: string; status?: number }> {
  if (!memberId) return { error: "Missing member_id", status: 400 };
  const { data: member } = await caller.db
    .from("members")
    .select("id, full_name, email, status, church_id, profile_id")
    .eq("id", memberId)
    .maybeSingle();
  if (!member) return { error: "Member not found.", status: 404 };
  if (member.profile_id) return { error: "This member already has a login.", status: 409 };
  if (member.status === "archived") return { error: "Restore this member before creating a login.", status: 400 };
  if (!member.church_id) return { error: "This member has no branch yet.", status: 400 };
  return { member };
}

// Creates the login (email already confirmed), fills in its profile and
// links it to the record. Undoes everything if a step fails.
export async function createLinkedLogin(
  caller: Caller, admin: SupabaseClient, member: MemberRow, email: string, password: string,
): Promise<{ userId?: string; error?: string; status?: number }> {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: member.full_name },
  });
  if (createErr || !created?.user) {
    const taken = /already|registered|exists/i.test(createErr?.message || "");
    return taken
      ? { error: `A login with ${email} already exists. Link that login to this member instead.`, status: 409 }
      : { error: `Could not create the login. ${friendlyError(createErr)}`, status: 500 };
  }
  const userId = created.user.id;

  // The sign-up trigger made the profile with just a name and the Member
  // level; fill in the rest.
  const { error: profileErr } = await admin.from("profiles").upsert({
    id: userId,
    full_name: member.full_name,
    email,
    role: "member",
    church_id: member.church_id,
    must_change_password: true,
  });

  // Link as the caller, so the activity log shows who did it.
  const { data: linked, error: linkErr } = profileErr
    ? { data: null, error: profileErr }
    : await caller.db
        .from("members")
        .update({ profile_id: userId })
        .eq("id", member.id)
        .is("profile_id", null)
        .select("id");

  if (profileErr || linkErr || !linked?.length) {
    // Undo, so a half-made login isn't left behind.
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    return {
      error: `Could not link the new login, so it was removed. ${profileErr || linkErr ? friendlyError(profileErr || linkErr) : "The member may have been linked by someone else just now."}`,
      status: 500,
    };
  }
  return { userId };
}
