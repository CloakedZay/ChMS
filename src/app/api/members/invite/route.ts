import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/app/lib/apiAuth";
import { getAdminClient } from "@/app/lib/supabaseAdmin";
import { sendMail, mailerReady, isRealEmail, looksLikeEmail } from "@/app/lib/mailer";
import { memberForLogin, createLinkedLogin, temporaryPassword } from "@/app/lib/memberLogin";

export const runtime = "nodejs";

// Invite a member by email (panel feedback, Oct 2026). Like
// api/members/create-login, but nobody passes on a password: the login is
// made with the member's own email and they get an email with
//   * one-click "Sign in with Google" — Supabase joins a Google account to
//     a login with the same verified email, so a Gmail address needs no
//     password at all, and
//   * a one-time link to choose a password (reset-password page).
// The Secretary never sees a password.
export async function POST(req: NextRequest) {
  const caller = await getCaller(req, ["secretary", "pastor"]);
  if (caller instanceof NextResponse) return caller;

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }
  if (!mailerReady()) {
    return NextResponse.json({ error: "Email sending is not set up yet (SMTP_USER / SMTP_PASS). Use Create login instead." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const found = await memberForLogin(caller, body?.member_id);
  if (!found.member) return NextResponse.json({ error: found.error }, { status: found.status });
  const member = found.member;

  const email = member.email?.trim().toLowerCase() || "";
  if (!looksLikeEmail(email) || !isRealEmail(email)) {
    return NextResponse.json({ error: "Add the member's own email first (Edit), then invite them." }, { status: 400 });
  }

  // A password nobody knows; they choose their own from the email, or use Google.
  const made = await createLinkedLogin(caller, admin, member, email, temporaryPassword() + temporaryPassword());
  if (!made.userId) return NextResponse.json({ error: made.error }, { status: made.status });

  const site = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  const { data: link } = await admin.auth.admin.generateLink({ type: "recovery", email });
  const setPassword = link?.properties?.hashed_token
    ? `${site}/reset-password?token_hash=${encodeURIComponent(link.properties.hashed_token)}`
    : `${site}/forgot-password`;
  const google = /@(gmail|googlemail)\.com$/i.test(email);

  try {
    await sendMail(
      email,
      "You're invited to FaithSync",
      `Hi ${member.full_name || "there"},\n\n` +
      `Your church made you a FaithSync login, so you can see events, announcements, ` +
      `your discipleship lessons and messages.\n\n` +
      (google
        ? `ONE CLICK: open ${site}/login and tap "Sign in with Google" with this Gmail (${email}). No password needed.\n\n` +
          `Or choose a password instead (the link works once, for a short time):\n${setPassword}\n\n`
        : `Choose your password here (the link works once, for a short time):\n${setPassword}\n\n` +
          `Then sign in at ${site}/login with ${email}. If this email is a Google account, ` +
          `"Sign in with Google" works too.\n\n`) +
      `If you weren't expecting this, you can ignore this email.`
    );
  } catch {
    return NextResponse.json({ email, sent: false, error: "The login was made, but the email could not be sent. They can use Forgot password on the sign-in page." });
  }
  return NextResponse.json({ email, sent: true });
}
