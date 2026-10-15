import { NextRequest, NextResponse } from "next/server";
import { getCaller, resolveChurchId, CONTENT_ROLES, AI_DOCUMENT_VIEWERS, GLOBAL_ROLES } from "@/app/lib/apiAuth";
import { reindexAll } from "@/app/lib/knowledge";

import { friendlyError } from "@/app/lib/errors";
export const runtime = "nodejs";
export const maxDuration = 300;

// How much is in the assistant's search index (for the Documents tab).
export async function GET(req: NextRequest) {
  const caller = await getCaller(req, AI_DOCUMENT_VIEWERS);
  if (caller instanceof NextResponse) return caller;

  const [all, withMeaning] = await Promise.all([
    caller.db.from("knowledge_chunks").select("id", { count: "exact", head: true }),
    caller.db.from("knowledge_chunks").select("id", { count: "exact", head: true }).not("embedding", "is", null),
  ]);
  if (all.error) {
    const missing = /does not exist|schema cache/i.test(all.error.message);
    return NextResponse.json({ ready: false, error: missing ? "not-set-up" : friendlyError(all.error) });
  }
  return NextResponse.json({ ready: true, passages: all.count || 0, withMeaning: withMeaning.count || 0 });
}

// Rebuild the index: every document of the branch (all branches for the
// Pastor / Admin when none is picked), the documents for all branches (the
// Pastor's, db/045) and every handout the caller may edit.
export async function POST(req: NextRequest) {
  const caller = await getCaller(req, CONTENT_ROLES);
  if (caller instanceof NextResponse) return caller;

  const { church_id } = await req.json().catch(() => ({}));
  const churchId = resolveChurchId(caller, church_id);
  const allBranches = GLOBAL_ROLES.includes(caller.role) && !church_id;

  try {
    const report = await reindexAll(caller.db, churchId, allBranches, caller.role === "pastor");
    return NextResponse.json({ success: true, ...report });
  } catch (err) {
    console.error("Rebuilding the search index failed:", err);
    return NextResponse.json({ error: friendlyError(err, "Rebuild failed. Please try again.") }, { status: 500 });
  }
}
