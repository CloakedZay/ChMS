import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseAnonKey } from "@/app/lib/supabase";

// Roles that can switch between church branches (same as the dashboard pages).
export const GLOBAL_ROLES = ["admin", "pastor"];

// Roles that can manage shared content (chatbot documents, bible verses).
// Matches the module/handout policies in db/001.
export const CONTENT_ROLES = ["admin", "pastor", "leader", "staff"];

export type Caller = {
  db: SupabaseClient; // queries run as the caller, so RLS applies
  userId: string;
  role: string;
  churchId: string | null;
};

// Identify the user behind an /api request from its "Authorization: Bearer"
// header (sent by lib/authFetch.js). Returns a ready error response if they
// aren't signed in or their role isn't in allowedRoles.
export async function getCaller(
  req: NextRequest,
  allowedRoles?: string[]
): Promise<Caller | NextResponse> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const db = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) {
    return NextResponse.json({ error: "Session expired. Please sign in again." }, { status: 401 });
  }

  const { data: profile } = await db
    .from("profiles")
    .select("role, church_id")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "member";
  if (allowedRoles && !allowedRoles.includes(role)) {
    return NextResponse.json({ error: "You don't have permission to do this." }, { status: 403 });
  }

  return { db, userId: user.id, role, churchId: profile?.church_id ?? null };
}

// Global roles may act on the branch they picked; everyone else is locked to
// their own church regardless of what the request asks for.
export function resolveChurchId(caller: Caller, requested?: string | null): string | null {
  if (requested && GLOBAL_ROLES.includes(caller.role)) return requested;
  return caller.churchId;
}
