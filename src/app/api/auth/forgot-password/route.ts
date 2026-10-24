import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/app/lib/supabaseAdmin";
import { sendMail, mailerReady, isRealEmail, NO_EMAIL_DOMAIN } from "@/app/lib/mailer";
import { humanCheckPassed } from "@/app/lib/turnstile";

export const runtime = "nodejs";

const PER_HOUR = 3;       // reset emails per login per hour
const MAX_LOGINS = 5;     // logins one shared recovery email can reset at once

// "Forgot password?" on the sign-in page (db/080). Not signed in. The person
// types their username (with or without @members.faithsync.app) or their
// recovery email. Each matching login gets a one-time reset link, sent to
// its confirmed recovery email, or to the login's own email when that is a
// real address. Disabled logins get nothing.
//
// The answer is always the same, whether or not anything matched, so this
// can't be used to find out which usernames or emails exist.
export async function POST(req: NextRequest) {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }
  if (!mailerReady()) {
    return NextResponse.json({ error: "Email sending is not set up yet. Please ask the church admin to reset your password." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  if (!await humanCheckPassed(req, body?.captchaToken)) {
    return NextResponse.json({ error: 'The "Verify you are human" check failed or expired. Please try again.' }, { status: 400 });
  }
  const typed = String(body?.login || "").trim().toLowerCase();
  if (!typed || typed.length > 254) {
    return NextResponse.json({ error: "Enter your username or recovery email." }, { status: 400 });
  }
  const loginEmail = typed.includes("@") ? typed : `${typed}${NO_EMAIL_DOMAIN}`;

  const [{ data: byLogin }, { data: byRecovery }] = await Promise.all([
    admin.from("profiles").select("id").eq("email", loginEmail),
    admin.from("recovery_emails").select("user_id").eq("email", typed).not("verified_at", "is", null),
  ]);
  const ids = [...new Set([
    ...(byLogin || []).map((p) => p.id),
    ...(byRecovery || []).map((r) => r.user_id),
  ])].slice(0, MAX_LOGINS);

  const site = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  const hourAgo = new Date(Date.now() - 3600000).toISOString();

  for (const id of ids) {
    const [{ data: profile }, { data: recovery }, { count }] = await Promise.all([
      admin.from("profiles").select("email, disabled").eq("id", id).maybeSingle(),
      admin.from("recovery_emails").select("email, verified_at").eq("user_id", id).maybeSingle(),
      admin.from("password_reset_log").select("id", { count: "exact", head: true })
        .eq("user_id", id).gte("sent_at", hourAgo),
    ]);
    if (!profile?.email || profile.disabled || (count ?? 0) >= PER_HOUR) continue;

    const to = recovery?.verified_at && recovery.email
      ? recovery.email
      : isRealEmail(profile.email) ? profile.email : null;
    if (!to) continue;

    // The link goes to our own page, which spends the token only when the
    // person saves a new password. Supabase's ready-made link spends it on
    // the first visit, so a mail scanner or click tracker opening it first
    // would leave the person an "expired" link.
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: profile.email,
    });
    if (linkErr || !link?.properties?.hashed_token) continue;
    const resetUrl = `${site}/reset-password?token_hash=${encodeURIComponent(link.properties.hashed_token)}`;

    try {
      await sendMail(
        to,
        "Reset your FaithSync password",
        `Someone asked to reset the password for this FaithSync login:\n\n` +
        `    ${profile.email}\n\n` +
        `Open this link to choose a new password (it works once, for a short time):\n\n` +
        `${resetUrl}\n\n` +
        `If you didn't ask for this, ignore this email. Your password stays the same.`
      );
      await admin.from("password_reset_log").insert({ user_id: id });
    } catch {
      // Same answer either way; nothing to tell the person typing.
    }
  }

  return NextResponse.json({ ok: true });
}
