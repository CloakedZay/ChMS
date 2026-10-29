import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/app/lib/apiAuth";
import { getAdminClient } from "@/app/lib/supabaseAdmin";
import { smsReady, smsRecipients, sendToAll, smsText } from "@/app/lib/sms";
import { formatEventTime } from "@/app/lib/eventTime";

export const runtime = "nodejs";

// Text a branch's members about a new event, or that one date of an event
// is cancelled (db/101; body.cancelled = true). Leaders add and cancel
// events (db/050), the Pastor may too. The event is read as the caller, so
// only events they can see. A new weekly event is texted once, with its
// dates. The day-before reminder (api/sms/event-reminders) still goes out
// for events that stay on.

const day = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });

export async function POST(req: NextRequest) {
  const caller = await getCaller(req, ["leader", "pastor"]);
  if (caller instanceof NextResponse) return caller;
  if (!smsReady()) {
    return NextResponse.json({ error: "Text messages are not set up yet (SMSGATE_USERNAME / SMSGATE_PASSWORD). The event was still saved." }, { status: 503 });
  }
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { data: ev } = await caller.db.from("events")
    .select("id, title, date, start_time, venue, meeting_link, church_id, series_id, status")
    .eq("id", body?.event_id).maybeSingle();
  const cancelled = body?.cancelled === true;
  if (!ev || !ev.church_id || ev.status !== (cancelled ? "cancelled" : "approved")) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }
  const time = ev.start_time ? ` at ${formatEventTime(ev.start_time)}` : "";

  if (cancelled) {
    const { data: note } = await caller.db.from("events").select("cancel_note").eq("id", ev.id).maybeSingle();
    const people = await smsRecipients(admin, ev.church_id);
    const result = await sendToAll(admin, "event_cancelled", ev.id, people,
      smsText(`FaithSync: CANCELLED - ${ev.title} on ${ev.date ? day(ev.date) : ""}${time}.${note?.cancel_note ? ` ${note.cancel_note}` : ""}`));
    return NextResponse.json(result);
  }

  let when = ev.date ? day(ev.date) : "";
  if (ev.series_id) {
    const { data: dates } = await caller.db.from("events").select("date")
      .eq("series_id", ev.series_id).order("date");
    const last = dates?.at(-1)?.date;
    if (last && last !== ev.date) when = `every ${new Date(`${ev.date}T00:00:00`).toLocaleDateString("en-PH", { weekday: "long" })}, ${day(ev.date)} to ${day(last)}`;
  }
  const where = ev.venue ? `, ${ev.venue}` : ev.meeting_link ? `, online: ${ev.meeting_link}` : "";

  const people = await smsRecipients(admin, ev.church_id);
  const result = await sendToAll(admin, "event_new", ev.id, people,
    smsText(`FaithSync: New event - ${ev.title}, ${when}${time}${where}.`));
  return NextResponse.json(result);
}
