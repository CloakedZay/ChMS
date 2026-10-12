import { NextRequest, NextResponse } from "next/server";
import { getCaller, HANDOUT_ROLES } from "@/app/lib/apiAuth";
import { getHandout, indexHandout } from "@/app/lib/knowledge";

export const runtime = "nodejs";
export const maxDuration = 60;

// Add one discipleship handout to the assistant's search index. Called by
// the Training page right after a handout is uploaded.
export async function POST(req: NextRequest) {
  const caller = await getCaller(req, HANDOUT_ROLES);
  if (caller instanceof NextResponse) return caller;

  const { handout_id } = await req.json().catch(() => ({}));
  if (!handout_id) return NextResponse.json({ error: "Missing handout_id" }, { status: 400 });

  const handout = await getHandout(caller.db, handout_id);
  if (!handout) return NextResponse.json({ error: "Handout not found" }, { status: 404 });

  try {
    const result = await indexHandout(caller.db, handout);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("Indexing handout failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not index the handout" }, { status: 500 });
  }
}
