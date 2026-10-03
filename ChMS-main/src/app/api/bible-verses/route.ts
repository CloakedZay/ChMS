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

  throw new Error("Unsupported file type. Please upload a PDF file.");
}

// Split raw extracted text into { reference, verse_text } entries.
// Looks for "Book Chapter:Verse" style references (e.g. "John 3:16",
// "1 Corinthians 13:4-7") and treats the text between one reference and
// the next as that verse. Falls back to splitting on blank lines if no
// references are detected at all.
function parseVerses(text: string): { reference: string; verse_text: string }[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ");

  const refPattern =
    /(?:^|\n|\s)((?:[1-3]\s)?[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?\s\d{1,3}:\d{1,3}(?:-\d{1,3})?)/g;

  const matches: { ref: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = refPattern.exec(normalized)) !== null) {
    matches.push({ ref: m[1].trim(), start: m.index, end: m.index + m[0].length });
  }

  const verses: { reference: string; verse_text: string }[] = [];

  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].end;
      const end = i + 1 < matches.length ? matches[i + 1].start : normalized.length;
      let verseText = normalized.slice(start, end).trim();
      verseText = verseText.replace(/^[-–—:.\s]+/, "").trim().replace(/\s+/g, " ");
      if (verseText.length >= 5) {
        verses.push({ reference: matches[i].ref, verse_text: verseText });
      }
    }
  }

  if (verses.length === 0) {
    const paragraphs = normalized
      .split(/\n\s*\n/)
      .map((p) => p.trim().replace(/\s+/g, " "))
      .filter((p) => p.length >= 10);
    paragraphs.forEach((p, i) => {
      verses.push({ reference: `Verse ${i + 1}`, verse_text: p });
    });
  }

  return verses;
}

// List all verses
export async function GET() {
  const { data, error } = await supabase
    .from("bible_verses")
    .select("id, reference, verse_text, created_at")
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ verses: data || [] });
}

// Upload a PDF (parsed + bulk inserted) OR add one verse manually via JSON body
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const { reference, verse_text } = await req.json();
      if (!reference?.trim() || !verse_text?.trim()) {
        return NextResponse.json({ error: "Missing reference or verse text" }, { status: 400 });
      }
      const { error } = await supabase.from("bible_verses").insert({
        reference: reference.trim(),
        verse_text: verse_text.trim(),
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Max 10MB." }, { status: 400 });
    }

    let text: string;
    try {
      text = await extractText(file);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not read file.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const verses = parseVerses(text);
    if (verses.length === 0) {
      return NextResponse.json(
        { error: "Could not find any verses in this PDF." },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("bible_verses").insert(verses);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: verses.length });
  } catch (err) {
    console.error("Bible verse upload error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

// Delete one verse (?id=) or every verse (?all=true)
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const all = req.nextUrl.searchParams.get("all");

  if (all === "true") {
    const { error } = await supabase.from("bible_verses").delete().gt("id", 0);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabase.from("bible_verses").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
