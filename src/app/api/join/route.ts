import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/app/lib/supabaseAdmin";
import { humanCheckPassed } from "@/app/lib/turnstile";
import { looksLikeEmail } from "@/app/lib/mailer";
import { cleanPhone } from "@/app/lib/format";

export const runtime = "nodejs";

// "Ask to join" (/join, db/093). Not signed in.
//   GET   the branches to choose from (name only)
//   POST  saves a request for the branch's Secretary to approve
// One open request per email or phone; at most 20 new requests a day per
// branch, so the list can't be flooded.

const PER_BRANCH_PER_DAY = 20;

export async function GET() {
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ branches: [] });
  const { data } = await admin.from("churches").select("id, name, is_main").order("name");
  const branches = (data || []).sort((a, b) => Number(b.is_main) - Number(a.is_main))
    .map(({ id, name }) => ({ id, name }));
  return NextResponse.json({ branches });
}

export async function POST(req: NextRequest) {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }
  const body = await req.json().catch(() => ({}));
  if (!await humanCheckPassed(req, body?.captchaToken)) {
    return NextResponse.json({ error: 'The "Verify you are human" check failed or expired. Please try again.' }, { status: 400 });
  }

  const fullName = String(body?.full_name || "").replace(/\s+/g, " ").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const phone = cleanPhone(body?.phone);
  const churchId = String(body?.church_id || "");
  const note = String(body?.note || "").trim().slice(0, 500);

  if (fullName.length < 2 || fullName.length > 120) return NextResponse.json({ error: "Please enter your full name." }, { status: 400 });
  if (email && !looksLikeEmail(email)) return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  if (phone === null) return NextResponse.json({ error: "Use an 11-digit mobile number starting with 09." }, { status: 400 });
  if (!email && !phone) return NextResponse.json({ error: "Give an email or a mobile number, so the church can reach you." }, { status: 400 });

  const { data: church } = await admin.from("churches").select("id").eq("id", churchId).maybeSingle();
  if (!church) return NextResponse.json({ error: "Please choose your branch." }, { status: 400 });

  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const or = [email && `email.eq.${email}`, phone && `phone.eq.${phone}`].filter(Boolean).join(",");
  const [{ count: open }, { count: today }] = await Promise.all([
    admin.from("join_requests").select("id", { count: "exact", head: true }).eq("status", "pending").or(or),
    admin.from("join_requests").select("id", { count: "exact", head: true }).eq("church_id", churchId).gte("created_at", dayAgo),
  ]);
  if ((open ?? 0) > 0) {
    return NextResponse.json({ ok: true, already: true });
  }
  if ((today ?? 0) >= PER_BRANCH_PER_DAY) {
    return NextResponse.json({ error: "Too many requests today. Please try again tomorrow, or talk to the church secretary." }, { status: 429 });
  }

  const { error } = await admin.from("join_requests").insert({
    full_name: fullName, email: email || null, phone: phone || null, church_id: churchId, note: note || null,
  });
  if (error) {
    return NextResponse.json({ error: /join_requests/.test(error.message)
      ? "Joining online isn't set up yet (db/093). Please talk to the church secretary."
      : "Could not send your request. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
