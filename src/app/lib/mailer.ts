import nodemailer from "nodemailer";

// SERVER ONLY. Sends email from the app itself, for messages Supabase can't
// send: a recovery email is not the login's own address, and Supabase only
// mails that one (db/080). Uses the same Gmail sender as Supabase's SMTP
// settings (docs/DEPLOYMENT.md), from .env.local:
//   SMTP_USER   the Gmail address
//   SMTP_PASS   its app password
//   SMTP_HOST / SMTP_PORT   optional, default smtp.gmail.com / 587
// Returns false when it isn't set up, so the route can say so.

export function mailerReady(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!mailerReady()) return false;
  const port = Number(process.env.SMTP_PORT) || 587;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({
    from: `FaithSync <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
  });
  return true;
}

// Made-up login names (api/members/create-login) can't receive email.
export const NO_EMAIL_DOMAIN = "@members.faithsync.app";

export function isRealEmail(email?: string | null): boolean {
  return !!email && !email.toLowerCase().endsWith(NO_EMAIL_DOMAIN);
}

export function looksLikeEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 254;
}
