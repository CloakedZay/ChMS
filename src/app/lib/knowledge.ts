import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkText } from "@/app/lib/nlp";
import { embedPassages, toVector } from "@/app/lib/embeddings";
import { extractText, canExtract } from "@/app/lib/extractText";

import { friendlyError } from "@/app/lib/errors";
// Builds the assistant's search index (knowledge_chunks, db/035) from
// chatbot documents and discipleship handouts. Runs on the server as the
// signed-in Pastor / Leader, so the database rules decide what they may
// index.

export type IndexResult = { chunks: number; semantic: boolean; skipped?: string };

// church_id null = a document for all branches (db/045)
type DocumentRow = { id: string | number; title: string; church_id: string | null; content: string; is_active?: boolean | null };
type HandoutRow = { id: string | number; module_id: number; file_name: string; file_path: string; description: string | null };

async function replaceChunks(
  db: SupabaseClient,
  base: { source_type: "document" | "handout"; source_id: string; church_id: string | null; module_id: number | null; title: string; subtitle: string | null; is_active: boolean },
  text: string
): Promise<IndexResult> {
  const pieces = chunkText(text);
  const vectors = await embedPassages(pieces.map((p) => `${base.title}\n${p}`));

  const del = await db.from("knowledge_chunks").delete()
    .eq("source_type", base.source_type).eq("source_id", base.source_id);
  if (del.error) throw new Error(del.error.message);

  const rows = pieces.map((content, i) => ({
    ...base,
    chunk_index: i,
    content,
    embedding: vectors ? toVector(vectors[i]) : null,
  }));
  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await db.from("knowledge_chunks").insert(rows.slice(i, i + 50));
    if (error) throw new Error(error.message);
  }
  return { chunks: rows.length, semantic: !!vectors };
}

export async function indexDocument(db: SupabaseClient, doc: DocumentRow): Promise<IndexResult> {
  if (!doc.content?.trim()) return { chunks: 0, semantic: false, skipped: "no text" };
  return replaceChunks(db, {
    source_type: "document",
    source_id: String(doc.id),
    church_id: doc.church_id,
    module_id: null,
    title: doc.title,
    subtitle: null,
    is_active: doc.is_active !== false,
  }, doc.content);
}

export async function indexHandout(db: SupabaseClient, handout: HandoutRow): Promise<IndexResult> {
  if (!canExtract(handout.file_name)) return { chunks: 0, semantic: false, skipped: "not a PDF, Word or text file" };

  const { data: mod } = await db.from("discipleship_modules").select("title").eq("id", handout.module_id).maybeSingle();
  const file = await db.storage.from("handouts").download(handout.file_path);
  if (file.error || !file.data) throw new Error(file.error?.message || "Could not open the handout file");

  const buffer = Buffer.from(await file.data.arrayBuffer());
  const text = (await extractText(buffer, handout.file_name, file.data.type)).trim();
  if (!text) return { chunks: 0, semantic: false, skipped: "no readable text (scanned PDF?)" };

  return replaceChunks(db, {
    source_type: "handout",
    source_id: String(handout.id),
    church_id: null,
    module_id: handout.module_id,
    title: handout.description?.trim() || handout.file_name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " "),
    subtitle: mod?.title ? `Module: ${mod.title}` : "Discipleship handout",
    is_active: true,
  }, text);
}

export async function getHandout(db: SupabaseClient, id: string | number): Promise<HandoutRow | null> {
  const { data } = await db.from("module_handouts")
    .select("id, module_id, file_name, file_path, description").eq("id", id).maybeSingle();
  return (data as HandoutRow) || null;
}

// Rebuild everything the caller may index: documents of the branch (or
// every branch for the Pastor when no branch is picked), the documents for
// all branches if includeShared (only the Pastor may write those), and all
// handouts of modules they may edit. Failures are collected, not fatal.
export async function reindexAll(db: SupabaseClient, churchId: string | null, includeAllBranches: boolean, includeShared: boolean) {
  const report = { documents: 0, handouts: 0, chunks: 0, semantic: true, skipped: [] as string[], failed: [] as string[] };

  let q = db.from("chatbot_documents").select("id, title, church_id, content, is_active");
  if (!includeAllBranches && churchId) {
    q = includeShared ? q.or(`church_id.eq.${churchId},church_id.is.null`) : q.eq("church_id", churchId);
  }
  const { data: docs, error: docErr } = await q;
  if (docErr) throw new Error(docErr.message);

  for (const d of (docs || []) as DocumentRow[]) {
    try {
      const r = await indexDocument(db, d);
      if (r.skipped) report.skipped.push(`${d.title}: ${r.skipped}`);
      else { report.documents += 1; report.chunks += r.chunks; report.semantic &&= r.semantic; }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      // Not theirs to index (another branch, or a module they can't edit).
      if (!/row-level security/i.test(raw)) report.failed.push(`${d.title}: ${friendlyError(err, "could not be indexed")}`);
    }
  }

  const { data: handouts } = await db.from("module_handouts").select("id, module_id, file_name, file_path, description");
  for (const h of (handouts || []) as HandoutRow[]) {
    try {
      const r = await indexHandout(db, h);
      if (r.skipped) report.skipped.push(`${h.file_name}: ${r.skipped}`);
      else { report.handouts += 1; report.chunks += r.chunks; report.semantic &&= r.semantic; }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      // Not theirs to index (another branch, or a module they can't edit).
      if (!/row-level security/i.test(raw)) report.failed.push(`${h.file_name}: ${friendlyError(err, "could not be indexed")}`);
    }
  }
  return report;
}
