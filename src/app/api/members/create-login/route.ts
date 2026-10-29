import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { getCaller } from "@/app/lib/apiAuth";
import { getAdminClient } from "@/app/lib/supabaseAdmin";
import { memberForLogin, createLinkedLogin, temporaryPassword } from "@/app/lib/memberLogin";

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

// Secretary creates a login for a member record in their own church
// (step E1, db/014); the Pastor for any branch (db/062). The new login is linked to the record, gets the
// member's branch and the Member level, and must change its password on
// first sign-in. Returns the username and temporary password once.
// api/members/invite does the same but emails the person instead.
export async function POST(req: NextRequest) {
  const caller = await getCaller(req, ["secretary", "pastor"]);
  if (caller instanceof NextResponse) return caller;

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const found = await memberForLogin(caller, body?.member_id);
  if (!found.member) return NextResponse.json({ error: found.error }, { status: found.status });
  const member = found.member;

  const email = member.email?.trim().toLowerCase() || usernameFor(member.full_name || "member");
  const password = temporaryPassword();

  const made = await createLinkedLogin(caller, admin, member, email, password);
  if (!made.userId) return NextResponse.json({ error: made.error }, { status: made.status });

  return NextResponse.json({ email, password });
}
