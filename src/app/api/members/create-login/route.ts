import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { getCaller } from "@/app/lib/apiAuth";
import { getAdminClient } from "@/app/lib/supabaseAdmin";

export const runtime = "nodejs";

// Made-up login names for members without an email. Nothing is ever sent
// to this domain; once the member links Google they don't need it again.
const LOGIN_DOMAIN = "members.faithsync.app";

function usernameFor(fullName: string): string {
  const base = fullName
    .normalize("NFD").replace(/[̀-ͯ]/g, "")  // ñ → n, é → e
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 40) || "member";
  return `${base}.${randomInt(1000, 10000)}@${LOGIN_DOMAIN}`;
}

// No look-alike characters (0/O, 1/l/I), so it can be read out or written down.
function temporaryPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[randomInt(chars.length)];
  return s;
}

// Secretary creates a login for a member record in their own church
// (step E1, db/014). The new login is linked to the record, gets the
// member's branch and the Member level, and must change its password on
// first sign-in. Returns the username and temporary password once.
export async function POST(req: NextRequest) {
  const caller = await getCaller(req, ["secretary"]);
  if (caller instanceof NextResponse) return caller;

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const memberId = body?.member_id;
  if (!memberId) {
    return NextResponse.json({ error: "Missing member_id" }, { status: 400 });
  }

  // Read as the Secretary, so the database rules decide which records they
  // may touch (their own church only).
  const { data: member } = await caller.db
    .from("members")
    .select("id, full_name, email, status, church_id, profile_id")
    .eq("id", memberId)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }
  if (member.profile_id) {
    return NextResponse.json({ error: "This member already has a login." }, { status: 409 });
  }
  if (member.status === "archived") {
    return NextResponse.json({ error: "Restore this member before creating a login." }, { status: 400 });
  }
  if (!member.church_id) {
    return NextResponse.json({ error: "This member has no branch yet." }, { status: 400 });
  }

  const email = member.email?.trim().toLowerCase() || usernameFor(member.full_name || "member");
  const password = temporaryPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: member.full_name },
  });
  if (createErr || !created?.user) {
    const taken = /already|registered|exists/i.test(createErr?.message || "");
    return NextResponse.json(
      { error: taken
          ? `A login with ${email} already exists. Link that login to this member instead.`
          : `Could not create the login: ${createErr?.message}` },
      { status: taken ? 409 : 500 }
    );
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

  // Link as the Secretary, so the activity log shows who did it.
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
    return NextResponse.json(
      { error: `Could not link the new login, so it was removed. ${(profileErr || linkErr)?.message || "The member may have been linked by someone else just now."}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ email, password });
}
