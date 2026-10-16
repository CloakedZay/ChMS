import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/app/lib/apiAuth";
import { getAdminClient } from "@/app/lib/supabaseAdmin";

import { friendlyError } from "@/app/lib/errors";
export const runtime = "nodejs";

// Admin deletes a login made by mistake (a duplicate, a test account).
// Only when it has no church records (db/074 login_church_records):
// finance entries, events, approvals, attendance marks… Otherwise the
// Admin is told what is in the way and to disable the login instead, so
// history is never broken. The member record stays, unlinked.
//
//   POST { user_id, check_only? }  → { records: [{ what, how_many }] } when check_only
//                                   → { deleted: true } otherwise
export async function POST(req: NextRequest) {
  const caller = await getCaller(req, ["admin"]);
  if (caller instanceof NextResponse) return caller;

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = body?.user_id;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  }
  if (userId === caller.userId) {
    return NextResponse.json({ error: "You can't delete your own login." }, { status: 400 });
  }

  const { data: records, error: checkErr } = await admin.rpc("login_church_records", { p_user: userId });
  if (checkErr) {
    const missing = /does not exist|schema cache|Could not find/i.test(checkErr.message);
    return NextResponse.json(
      { error: missing ? "Deleting logins needs db/074_delete_unused_logins.sql. Ask the administrator to run it." : friendlyError(checkErr) },
      { status: 500 }
    );
  }
  if (body?.check_only) return NextResponse.json({ records: records || [] });

  if (records?.length) {
    const list = records.map((r: { what: string; how_many: number }) => `${r.how_many} ${r.what}`).join(", ");
    return NextResponse.json(
      { error: `This login has church records (${list}), so it can't be deleted. Disable it instead.` },
      { status: 409 }
    );
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    return NextResponse.json({ error: `Could not delete the login. ${friendlyError(delErr)}` }, { status: 500 });
  }
  return NextResponse.json({ deleted: true });
}
