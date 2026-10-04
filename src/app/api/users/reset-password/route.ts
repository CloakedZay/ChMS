import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { getCaller } from "@/app/lib/apiAuth";
import { getAdminClient } from "@/app/lib/supabaseAdmin";

export const runtime = "nodejs";

// No look-alike characters (0/O, 1/l/I), so it can be read out or written down.
function temporaryPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[randomInt(chars.length)];
  return s;
}

// Admin gives someone a new temporary password (forgotten password). The
// person must choose their own at their next sign-in. Admins change their
// own password on the Change password page instead. Returns the username
// and temporary password once.
export async function POST(req: NextRequest) {
  const caller = await getCaller(req, ["admin"]);
  if (caller instanceof NextResponse) return caller;

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = body?.user_id;
  if (!userId) {
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  }
  if (userId === caller.userId) {
    return NextResponse.json({ error: "Use Change password for your own account." }, { status: 400 });
  }

  const { data: target, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr || !target?.user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Flag first, as the Admin, so the activity log shows who reset it and
  // nothing changes if the Admin isn't allowed to.
  const { data: flagged, error: flagErr } = await caller.db
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", userId)
    .select("id");
  if (flagErr || !flagged?.length) {
    return NextResponse.json(
      { error: `Could not reset the password. ${flagErr?.message || "You don't have permission to change this user."}` },
      { status: 403 }
    );
  }

  const password = temporaryPassword();
  const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password });
  if (pwErr) {
    // Put the flag back so they aren't asked to change a password that didn't change.
    await caller.db.from("profiles").update({ must_change_password: false }).eq("id", userId);
    return NextResponse.json({ error: `Could not reset the password: ${pwErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ email: target.user.email, password });
}
