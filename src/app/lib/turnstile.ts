import { NextRequest } from "next/server";

// SERVER ONLY. Checks a "Verify you are human" token (components/Turnstile.js)
// with Cloudflare, for routes Supabase's own CAPTCHA check doesn't cover
// (api/auth/forgot-password uses the admin API). Needs TURNSTILE_SECRET_KEY
// in .env.local; without it the check is off and every request passes.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function humanCheckPassed(req: NextRequest, token: unknown): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;

  const body = new URLSearchParams({ secret, response: token });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body });
    const json = await res.json();
    return json?.success === true;
  } catch {
    return false;
  }
}
