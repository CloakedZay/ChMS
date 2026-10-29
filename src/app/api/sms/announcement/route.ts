import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/app/lib/apiAuth";
import { getAdminClient } from "@/app/lib/supabaseAdmin";
import { smsReady, smsRecipients, sendToAll, smsText } from "@/app/lib/sms";

export const runtime = "nodejs";

// Text an announcement to its members (db/096). Only the Secretary, who
// posts announcements (db/091). The announcement is read as the caller,
// so they can only send their own branch's. Each member gets it once.
export async function POST(req: NextRequest) {
  const caller = await getCaller(req, ["secretary"]);
  if (caller instanceof NextResponse) return caller;
  if (!smsReady()) {
    return NextResponse.json({ error: "Text messages are not set up yet (Twilio keys). The announcement was still posted." }, { status: 503 });
  }
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { data: a } = await caller.db.from("announcements")
    .select("id, title, body, church_id, ministry_id").eq("id", body?.announcement_id).maybeSingle();
  if (!a || !a.church_id || a.church_id !== caller.churchId) {
    return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
  }

  const people = await smsRecipients(admin, a.church_id, a.ministry_id);
  const text = smsText(`FaithSync: ${a.title}${a.body ? ` - ${a.body}` : ""}`);
  const result = await sendToAll(admin, "announcement", a.id, people, text);
  return NextResponse.json(result);
}
