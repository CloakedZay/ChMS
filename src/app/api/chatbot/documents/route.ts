import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/app/lib/extractText";
import { indexDocument } from "@/app/lib/knowledge";
import { getCaller, resolveChurchId, CONTENT_ROLES, AI_DOCUMENT_VIEWERS } from "@/app/lib/apiAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// List documents for a church
export async function GET(req: NextRequest) {
  const caller = await getCaller(req, AI_DOCUMENT_VIEWERS);
  if (caller instanceof NextResponse) return caller;

  const church_id = resolveChurchId(caller, req.nextUrl.searchParams.get("church_id"));
  if (!church_id) {
    return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
  }

  const { data, error } = await caller.db
    .from("chatbot_documents")
    .select("id, title, doc_type, is_active, created_at")
    .eq("church_id", church_id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    const docType = formData.get("doc_type")?.toString().trim() || "Other";
    const churchId = resolveChurchId(caller, formData.get("church_id")?.toString());

    if (!(file instanceof File) || !title || !churchId) {
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
      const message = err instanceof Error ? err.message : "Could not read file.";
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
      doc_type: docType,
      church_id: churchId,
      is_active: true,
      created_by: caller.userId,
    }).select("id, title, doc_type, church_id, content, is_active").single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Add it to the assistant's search index. The upload still counts if
    // this fails; "Rebuild search index" can retry later.
    let indexed: { chunks: number; semantic: boolean } | null = null;
    let indexWarning: string | null = null;
    try {
      indexed = await indexDocument(caller.db, saved);
    } catch (err) {
      indexWarning = err instanceof Error ? err.message : "Could not add it to the search index.";
      console.error("Indexing document failed:", err);
    }

    return NextResponse.json({ success: true, indexed, indexWarning });
  } catch (err) {
    console.error("Chatbot document upload error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

// Toggle a document's active state
export async function PATCH(req: NextRequest) {
  const caller = await getCaller(req, CONTENT_ROLES);
  if (caller instanceof NextResponse) return caller;

  const { id, is_active } = await req.json();
  if (!id || typeof is_active !== "boolean") {
    return NextResponse.json({ error: "Missing id or is_active" }, { status: 400 });
  }

  // RLS silently skips rows from other churches, so check something changed.
  const { data, error } = await caller.db
    .from("chatbot_documents")
    .update({ is_active })
    .eq("id", id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
