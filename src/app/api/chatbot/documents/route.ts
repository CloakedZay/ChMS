import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/app/lib/extractText";
import { indexDocument } from "@/app/lib/knowledge";
import { getCaller, resolveChurchId, CONTENT_ROLES, AI_DOCUMENT_VIEWERS } from "@/app/lib/apiAuth";

import { friendlyError } from "@/app/lib/errors";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Documents with no branch are shared by every branch (db/045); only the
// Pastor may add, move or change them.
const SHARE_ROLE = "pastor";
const needsSetup = (err: { message: string }) => /null value in column "(church_id|doc_type)"/i.test(err.message)
  ? "This needs db/045_shared_documents.sql. Ask the administrator to run it."
  : friendlyError(err);

// List a church's documents, plus the ones shared by all branches
export async function GET(req: NextRequest) {
  const caller = await getCaller(req, AI_DOCUMENT_VIEWERS);
  if (caller instanceof NextResponse) return caller;

  const church_id = resolveChurchId(caller, req.nextUrl.searchParams.get("church_id"));
  if (!church_id || !UUID.test(church_id)) {
    return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
  }

  const list = (columns: string) => caller.db
    .from("chatbot_documents")
    .select(columns)
    .or(`church_id.eq.${church_id},church_id.is.null`)
    .order("created_at", { ascending: false });
  let { data, error } = await list("id, title, church_id, is_active, staff_only, created_at");
  // Before db/039 there is no staff_only column.
  if (error && /staff_only/.test(error.message)) {
    ({ data, error } = await list("id, title, church_id, is_active, created_at"));
  }

  if (error) {
    return NextResponse.json({ error: friendlyError(error) }, { status: 500 });
  }

  return NextResponse.json({ documents: data || [] });
}

// Upload a file, extract its text, save it as a chatbot_documents row
export async function POST(req: NextRequest) {
  try {
    const caller = await getCaller(req, CONTENT_ROLES);
    if (caller instanceof NextResponse) return caller;

    const formData = await req.formData();
    const file = formData.get("file");
    const title = formData.get("title")?.toString().trim();
    // "Staff only" documents (db/039) are never used to answer Members.
    const staffOnly = formData.get("staff_only")?.toString() === "true";
    const allBranches = formData.get("all_branches")?.toString() === "true";
    if (allBranches && caller.role !== SHARE_ROLE) {
      return NextResponse.json({ error: "Only the Pastor can add documents for all branches." }, { status: 403 });
    }
    const churchId = allBranches ? null : resolveChurchId(caller, formData.get("church_id")?.toString());

    if (!(file instanceof File) || !title || (!allBranches && !churchId)) {
      return NextResponse.json(
        { error: "Missing file, title, or church_id" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Max 10MB." }, { status: 400 });
    }

    let content: string;
    try {
      content = (await extractText(Buffer.from(await file.arrayBuffer()), file.name, file.type)).trim();
    } catch (err) {
      const message = friendlyError(err, "Could not read the file.");
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (!content) {
      return NextResponse.json(
        { error: "No readable text found in this file." },
        { status: 400 }
      );
    }

    const { data: saved, error } = await caller.db.from("chatbot_documents").insert({
      title,
      content,
      church_id: churchId,
      is_active: true,
      created_by: caller.userId,
      ...(staffOnly ? { staff_only: true } : {}),
    }).select("id, title, church_id, content, is_active").single();

    if (error) {
      return NextResponse.json({ error: needsSetup(error) }, { status: 500 });
    }

    // Add it to the assistant's search index. The upload still counts if
    // this fails; "Rebuild search index" can retry later.
    let indexed: { chunks: number; semantic: boolean } | null = null;
    let indexWarning: string | null = null;
    try {
      indexed = await indexDocument(caller.db, saved);
    } catch (err) {
      indexWarning = friendlyError(err, "Could not add it to the search index.");
      console.error("Indexing document failed:", err);
    }

    return NextResponse.json({ success: true, indexed, indexWarning });
  } catch (err) {
    console.error("Chatbot document upload error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

// Toggle a document's active state, who may use it ("staff only", db/039)
// or which branches use it (all_branches, db/045: back to church_id when
// false)
export async function PATCH(req: NextRequest) {
  const caller = await getCaller(req, CONTENT_ROLES);
  if (caller instanceof NextResponse) return caller;

  const { id, is_active, staff_only, all_branches, church_id } = await req.json();
  const changes: Record<string, boolean | string | null> = {};
  if (typeof is_active === "boolean") changes.is_active = is_active;
  if (typeof staff_only === "boolean") changes.staff_only = staff_only;
  if (typeof all_branches === "boolean") {
    if (caller.role !== SHARE_ROLE) {
      return NextResponse.json({ error: "Only the Pastor can choose which branches use a document." }, { status: 403 });
    }
    const branch = all_branches ? null : resolveChurchId(caller, church_id);
    if (!all_branches && !branch) return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    changes.church_id = branch;
  }
  if (!id || !Object.keys(changes).length) {
    return NextResponse.json({ error: "Missing id, is_active, staff_only or all_branches" }, { status: 400 });
  }

  // RLS silently skips rows from other churches, so check something changed.
  const { data, error } = await caller.db
    .from("chatbot_documents")
    .update(changes)
    .eq("id", id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: needsSetup(error) }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

// Delete a document
export async function DELETE(req: NextRequest) {
  const caller = await getCaller(req, CONTENT_ROLES);
  if (caller instanceof NextResponse) return caller;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { data, error } = await caller.db
    .from("chatbot_documents")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: friendlyError(error) }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
