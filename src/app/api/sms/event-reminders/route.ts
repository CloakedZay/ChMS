import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/app/lib/supabaseAdmin";
import { smsReady, smsRecipients, sendToAll, smsText } from "@/app/lib/sms";
import { formatEventTime } from "@/app/lib/eventTime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Automatic event reminders by text (db/096): every upcoming event
// tomorrow (Philippine date) is texted to its branch's members. Run once
// a day by the scheduler in vercel.json (08:00 Manila). Protected by
// CRON_SECRET: Vercel sends it as "Authorization: Bearer <secret>".
// Each member gets each event's reminder once, even if this runs twice.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  if (!smsReady()) return NextResponse.json({ skipped: "Twilio is not set up" });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const tomorrow = d.toISOString().slice(0, 10);

  const { data: events } = await admin.from("events")
    .select("id, title, date, start_time, venue, meeting_link, church_id")
    .eq("status", "approved").eq("date", tomorrow);

  const totals = { events: 0, sent: 0, failed: 0, skipped: 0 };
  for (const ev of events || []) {
    if (!ev.church_id) continue;
    const people = await smsRecipients(admin, ev.church_id);
    const when = ev.start_time ? ` at ${formatEventTime(ev.start_time)}` : "";
    const where = ev.venue ? `, ${ev.venue}` : ev.meeting_link ? `, online: ${ev.meeting_link}` : "";
    const r = await sendToAll(admin, "event_reminder", ev.id, people, smsText(`FaithSync reminder: ${ev.title} is tomorrow${when}${where}. See you there!`));
    totals.events++;
    totals.sent += r.sent; totals.failed += r.failed; totals.skipped += r.skipped;
  }
  return NextResponse.json(totals);
}
