import { SupabaseClient } from "@supabase/supabase-js";

// SERVER ONLY. Text messages through Twilio (db/096). Set in the server's
// environment (.env.local / Vercel):
//   TWILIO_ACCOUNT_SID   from the Twilio console
//   TWILIO_AUTH_TOKEN    from the Twilio console
//   TWILIO_FROM          the Twilio number or sender name to send from, or
//   TWILIO_MESSAGING_SERVICE_SID  instead of TWILIO_FROM
// Without them smsReady() is false and nothing is sent.

export function smsReady(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    && (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID));
}

// 09171234567 → +639171234567. Null for anything that isn't a PH mobile.
export function toE164(phone: string | null | undefined): string | null {
  const d = String(phone || "").replace(/\D/g, "");
  if (/^09\d{9}$/.test(d)) return `+63${d.slice(1)}`;
  if (/^639\d{9}$/.test(d)) return `+${d}`;
  return null;
}

export async function sendSms(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
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
  return (members || [])
    .filter((m) => !out.has(m.profile_id) && toE164(m.phone))
    .map((m) => ({ id: m.id, phone: toE164(m.phone)!, church_id: m.church_id }));
}

// Texts everyone once: members already in sms_log for this kind + ref are
// skipped, so a retry or a second cron run never doubles up.
export async function sendToAll(
  admin: SupabaseClient, kind: "announcement" | "event_reminder", refId: number, people: Recipient[], body: string,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const { data: done } = await admin.from("sms_log").select("member_id").eq("kind", kind).eq("ref_id", refId);
  const already = new Set((done || []).map((r) => r.member_id));
  let sent = 0, failed = 0, skipped = 0;
  for (const p of people) {
    if (already.has(p.id)) { skipped++; continue; }
    // Claim the row first, so two runs at once can't both send.
    const { error: claimErr } = await admin.from("sms_log")
      .insert({ kind, ref_id: refId, member_id: p.id, church_id: p.church_id, phone: p.phone, status: "sent" });
    if (claimErr) { skipped++; continue; }
    const r = await sendSms(p.phone, body);
    if (r.ok) sent++;
    else {
      failed++;
      await admin.from("sms_log").update({ status: "failed", error: r.error }).eq("kind", kind).eq("ref_id", refId).eq("member_id", p.id);
    }
  }
  return { sent, failed, skipped };
}
