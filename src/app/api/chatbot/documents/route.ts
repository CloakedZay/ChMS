import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

export const runtime = "nodejs";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  if (
    name.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (name.endsWith(".txt") || file.type === "text/plain") {
    return buffer.toString("utf-8");
  }

  throw new Error("Unsupported file type. Please upload a PDF, DOCX, or TXT file.");
}

// List documents for a church
export async function GET(req: NextRequest) {
  const church_id = req.nextUrl.searchParams.get("church_id");
  if (!church_id) {
    return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
  }

  const { data, error } = await supabase
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
    const formData = await req.formData();
    const file = formData.get("file");
    const title = formData.get("title")?.toString().trim();
    const docType = formData.get("doc_type")?.toString().trim() || "Other";
    const churchId = formData.get("church_id")?.toString();

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
      content = (await extractText(file)).trim();
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

    const { error } = await supabase.from("chatbot_documents").insert({
      title,
      content,
      doc_type: docType,
      church_id: churchId,
      is_active: true,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Chatbot document upload error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

// Toggle a document's active state
export async function PATCH(req: NextRequest) {
  const { id, is_active } = await req.json();
  if (!id || typeof is_active !== "boolean") {
    return NextResponse.json({ error: "Missing id or is_active" }, { status: 400 });
  }

  const { error } = await supabase
    .from("chatbot_documents")
    .update({ is_active })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// Delete a document
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabase.from("chatbot_documents").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
