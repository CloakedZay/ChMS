import { NextRequest, NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import { getCaller } from "@/app/lib/apiAuth";
import { getAdminClient } from "@/app/lib/supabaseAdmin";
import { sendMail, mailerReady, looksLikeEmail, NO_EMAIL_DOMAIN } from "@/app/lib/mailer";

import { friendlyError } from "@/app/lib/errors";
export const runtime = "nodejs";

const CODE_MINUTES = 15;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;

function hashCode(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

// The signed-in login's recovery email (db/080), used by "Forgot password?".
//   POST { action: "send", email }   email a 6-digit code to a new address
//   POST { action: "confirm", code } the code is right: it becomes the
//                                    recovery email
//   DELETE                           remove the recovery email
// Anyone signed in, for their own login only.
export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (caller instanceof NextResponse) return caller;

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { data: row } = await admin
    .from("recovery_emails")
    .select("*")
    .eq("user_id", caller.userId)
    .maybeSingle();

  if (body?.action === "send") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!looksLikeEmail(email) || email.endsWith(NO_EMAIL_DOMAIN)) {
      return NextResponse.json({ error: "Enter a real email address, like yourname@gmail.com." }, { status: 400 });
    }
    if (!mailerReady()) {
      return NextResponse.json({ error: "Email sending is not set up yet. Please tell the church admin." }, { status: 503 });
    }
    if (row?.code_sent_at && Date.now() - new Date(row.code_sent_at).getTime() < RESEND_SECONDS * 1000) {
      return NextResponse.json({ error: "A code was just sent. Wait a minute before asking for another." }, { status: 429 });
    }

    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    const { error: saveErr } = await admin.from("recovery_emails").upsert({
      user_id: caller.userId,
      email: row?.email ?? null,
      verified_at: row?.verified_at ?? null,
      pending_email: email,
      code_hash: hashCode(caller.userId, code),
      code_expires_at: new Date(Date.now() + CODE_MINUTES * 60000).toISOString(),
      code_sent_at: new Date().toISOString(),
      code_attempts: 0,
    });
    if (saveErr) {
      return NextResponse.json({ error: `Could not save the email. ${friendlyError(saveErr)}` }, { status: 500 });
    }

    try {
      await sendMail(
        email,
        `${code} is your FaithSync code`,
        `Your code to add this email to your FaithSync login is:\n\n${code}\n\n` +
        `It works for ${CODE_MINUTES} minutes. If you didn't ask for this, you can ignore this email.`
      );
    } catch {
      await admin.from("recovery_emails").update({ code_sent_at: null }).eq("user_id", caller.userId);
      return NextResponse.json({ error: "The code could not be sent. Check the email address and try again." }, { status: 502 });
    }
    return NextResponse.json({ pending_email: email });
  }

  if (body?.action === "confirm") {
    const code = String(body.code || "").replace(/\D/g, "");
    if (!row?.pending_email || !row.code_hash) {
      return NextResponse.json({ error: "Ask for a code first." }, { status: 400 });
    }
    if (row.code_attempts >= MAX_ATTEMPTS || new Date(row.code_expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "That code has expired. Send a new code." }, { status: 400 });
    }
    if (hashCode(caller.userId, code) !== row.code_hash) {
      await admin.from("recovery_emails")
        .update({ code_attempts: row.code_attempts + 1 })
        .eq("user_id", caller.userId);
      return NextResponse.json({ error: "That code is not right. Check the email and try again." }, { status: 400 });
    }

    const { error: saveErr } = await admin.from("recovery_emails").update({
      email: row.pending_email,
      verified_at: new Date().toISOString(),
      pending_email: null,
      code_hash: null,
      code_expires_at: null,
      code_attempts: 0,
    }).eq("user_id", caller.userId);
    if (saveErr) {
      return NextResponse.json({ error: `Could not save the email. ${friendlyError(saveErr)}` }, { status: 500 });
    }
    return NextResponse.json({ email: row.pending_email });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const caller = await getCaller(req);
  if (caller instanceof NextResponse) return caller;

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { error } = await admin.from("recovery_emails").delete().eq("user_id", caller.userId);
  if (error) {
    return NextResponse.json({ error: `Could not remove the email. ${friendlyError(error)}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
