import { SupabaseClient } from "@supabase/supabase-js";

// SERVER ONLY. Text messages (db/096). Set in the server's environment
// (.env.local / Vercel) ONE of (first one set wins):
//   SMS Gateway for Android (sms-gate.app) — free: an Android phone with
//   the app sends the texts from its own SIM, so the only cost is load.
//     SMSGATE_USERNAME, SMSGATE_PASSWORD  shown in the app → Cloud server
//     SMSGATE_URL  optional, default the public cloud server below
//   Semaphore (Philippines, semaphore.co), paid credits:
//     SEMAPHORE_API_KEY      from semaphore.co → Account → API
//     SEMAPHORE_SENDER_NAME  optional, an approved sender name (default
//                            Semaphore's own, "SEMAPHORE")
//   Twilio (no free trial in the Philippines):
//     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM (a number or
//     sender name) or TWILIO_MESSAGING_SERVICE_SID
// Without either, smsReady() is false and nothing is sent.

const smsGateReady = () => !!(process.env.SMSGATE_USERNAME && process.env.SMSGATE_PASSWORD);
const semaphoreReady = () => !!process.env.SEMAPHORE_API_KEY;
const twilioReady = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  && (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID));

export function smsReady(): boolean {
  return smsGateReady() || semaphoreReady() || twilioReady();
}

// 09171234567 → +639171234567. Null for anything that isn't a PH mobile.
export function toE164(phone: string | null | undefined): string | null {
  const d = String(phone || "").replace(/\D/g, "");
  if (/^09\d{9}$/.test(d)) return `+63${d.slice(1)}`;
  if (/^639\d{9}$/.test(d)) return `+${d}`;
  return null;
}

export async function sendSms(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (smsGateReady()) return sendSmsGate(to, body);
  return semaphoreReady() ? sendSemaphore(to, body) : sendTwilio(to, body);
}

// https://docs.sms-gate.app — the phone picks the message up and sends it.
async function sendSmsGate(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.SMSGATE_URL || "https://api.sms-gate.app/3rdparty/v1/messages";
  const auth = Buffer.from(`${process.env.SMSGATE_USERNAME}:${process.env.SMSGATE_PASSWORD}`).toString("base64");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ textMessage: { text: body }, phoneNumbers: [to] }),
    });
    if (res.ok) return { ok: true };
    const json = await res.json().catch(() => ({}));
    return { ok: false, error: String(json?.message || json?.error || res.statusText || res.status).slice(0, 300) };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err).slice(0, 300) };
  }
}

// https://semaphore.co/docs — one message per request; it takes 639XXXXXXXXX.
async function sendSemaphore(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const params = new URLSearchParams({
    apikey: process.env.SEMAPHORE_API_KEY!,
    number: to.replace(/^\+/, ""),
    message: body,
  });
  if (process.env.SEMAPHORE_SENDER_NAME) params.set("sendername", process.env.SEMAPHORE_SENDER_NAME);
  try {
    const res = await fetch("https://api.semaphore.co/api/v4/messages", { method: "POST", body: params });
    const json = await res.json().catch(() => null);
    // Success is a list of queued messages; errors come back as an object.
    if (res.ok && Array.isArray(json) && json.length && !/fail|refund/i.test(String(json[0]?.status || ""))) return { ok: true };
    const why = Array.isArray(json) ? json[0]?.status : json && typeof json === "object"
      ? Object.values(json).flat().join(" ") : res.statusText;
    return { ok: false, error: String(why || "Semaphore refused the message").slice(0, 300) };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err).slice(0, 300) };
  }
}

async function sendTwilio(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const params = new URLSearchParams({ To: to, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) params.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  else params.set("From", process.env.TWILIO_FROM!);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64") },
      body: params,
    });
    if (res.ok) return { ok: true };
    const json = await res.json().catch(() => ({}));
    return { ok: false, error: String(json?.message || res.statusText).slice(0, 300) };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err).slice(0, 300) };
  }
}

// Short enough for about two text messages.
export function smsText(s: string, max = 300): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max - 1) + "…" : one;
}

type Recipient = { id: number; phone: string; church_id: string };

// Members of a branch (or of one ministry) who can get texts: a mobile
// number, not archived, and — if they have a login — not opted out.
export async function smsRecipients(admin: SupabaseClient, churchId: string, ministryId?: string | null): Promise<Recipient[]> {
  let ids: number[] | null = null;
  if (ministryId) {
    const { data } = await admin.from("ministry_assignments").select("member_id").eq("ministry_id", ministryId);
    ids = (data || []).map((r) => r.member_id);
    if (!ids.length) return [];
  }
  let q = admin.from("members").select("id, phone, church_id, profile_id, status")
    .eq("church_id", churchId).not("phone", "is", null).neq("status", "archived");
  if (ids) q = q.in("id", ids);
  const { data: members } = await q;
  const withLogin = (members || []).map((m) => m.profile_id).filter(Boolean);
  const { data: optedOut } = withLogin.length
    ? await admin.from("profiles").select("id").in("id", withLogin).eq("sms_opt_out", true)
    : { data: [] };
  const out = new Set((optedOut || []).map((p) => p.id));
  // One text per number: family members (or duplicate records) often share a phone.
  const seen = new Set<string>();
  return (members || [])
    .filter((m) => !out.has(m.profile_id) && toE164(m.phone))
    .map((m) => ({ id: m.id, phone: toE164(m.phone)!, church_id: m.church_id }))
    .filter((r) => !seen.has(r.phone) && !!seen.add(r.phone));
}

// Texts everyone once: members already in sms_log for this kind + ref are
// skipped, so a retry or a second cron run never doubles up.
// refId: the event id or announcement uuid (sms_log.ref_id is text, db/100).
export async function sendToAll(
  admin: SupabaseClient, kind: "announcement" | "event_reminder", refId: number | string, people: Recipient[], body: string,
): Promise<{ sent: number; failed: number; skipped: number; error?: string }> {
  const ref = String(refId);
  const { data: done } = await admin.from("sms_log").select("member_id").eq("kind", kind).eq("ref_id", ref);
  const already = new Set((done || []).map((r) => r.member_id));
  let sent = 0, failed = 0, skipped = 0;
  let error: string | undefined;
  for (const p of people) {
    if (already.has(p.id)) { skipped++; continue; }
    // Claim the row first, so two runs at once can't both send.
    const { error: claimErr } = await admin.from("sms_log")
      .insert({ kind, ref_id: ref, member_id: p.id, church_id: p.church_id, phone: p.phone, status: "sent" });
    if (claimErr) {
      // Only a clash with an existing row means "already had it".
      if (claimErr.code === "23505") skipped++;
      else { failed++; error ??= `Could not log the text: ${claimErr.message}`; }
      continue;
    }
    const r = await sendSms(p.phone, body);
    if (r.ok) sent++;
    else {
      failed++;
      error ??= r.error;
      await admin.from("sms_log").update({ status: "failed", error: r.error }).eq("kind", kind).eq("ref_id", ref).eq("member_id", p.id);
    }
  }
  return { sent, failed, skipped, error };
}
