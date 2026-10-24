import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeQuestion, coverage, exactCoverage, isHeading, headingQuestion, looksLikeContents, normalize, type Analysis, type Related } from "@/app/lib/nlp";
import { embedQuery, embedPassages, toVector } from "@/app/lib/embeddings";
import { correctQuestion } from "@/app/lib/spelling";

// Shared search step of the assistant: clean the text, search the index
// (db/035, db/037 for one module), and re-rank. Used by the chatbot answer
// route and by "Related reading" / "What the handout says".

export type Hit = {
  id: number; source_type: "document" | "handout"; source_id: string; title: string; subtitle: string | null;
  content: string; text_rank: number; similarity: number | null; fuzzy: number; score: number;
  church_id?: string | null;   // documents: null = for all branches (db/045)
};
export type Ranked = Hit & { exact: number; cov: number; rank: number };

// The search only scores meaning for its 30 closest passages; one found by
// keyword alone comes back without a score. Score those here (same text the
// index embedded: title + passage) so every hit is ranked on the same scale —
// otherwise a passage that merely mentions the word (a book's subject index)
// outranks the real answer and then fails the relevance check with "0".
export async function fillSimilarity(hits: Hit[], vector: number[] | null): Promise<Hit[]> {
  const missing = vector ? hits.filter((h) => h.similarity == null) : [];
  if (!vector || !missing.length) return hits;
  const vecs = await embedPassages(missing.map((h) => `${h.title}\n${h.content}`));
  if (!vecs) return hits;
  const sims = new Map(missing.map((h, i) => [h, vecs[i].reduce((s, x, j) => s + x * vector[j], 0)]));
  return hits.map((h) => (sims.has(h) ? { ...h, similarity: sims.get(h)! } : h));
}

// Meaning first, then how many of the question's OWN words a passage has
// (so "prayer meeting" beats a lesson that only matches the synonyms of
// "prayer"), then synonym coverage. A document for all branches gives way
// to the branch's own one when both say much the same.
export function rerank(hits: Hit[], analysis: Analysis): Ranked[] {
  return hits
    .map((h) => {
      const text = `${h.title} ${h.content}`;
      const exact = exactCoverage(text, analysis);
      const cov = coverage(text, analysis);
      const shared = h.source_type === "document" && h.church_id === null ? 0.02 : 0;
      const rank = (h.similarity != null
        ? h.similarity + 0.15 * exact + 0.05 * cov + (h.text_rank > 0 ? 0.02 : 0)
        : exact + 0.5 * cov + Math.min(h.text_rank, 1) + 0.3 * h.fuzzy) - shared;
      return { ...h, exact, cov, rank };
    })
    .sort((a, b) => b.rank - a.rank);
}

// "Explain in detail" / "tell me more": the passage and the rest of its
// section, as readable paragraphs. The index repeats a section's heading at
// the top of each of its passages, so the section is the run of passages
// under the same heading. A long section comes in parts of about `size`
// characters; part 1 continues where part 0 stopped (text "" = nothing
// left). null when the passages can't be read — the caller then uses the
// passage alone.
export async function sectionPart(
  db: SupabaseClient, id: number, part: number, size = 3500
): Promise<{ text: string; more: boolean } | null> {
  if (id <= 0) return null;
  const { data: me } = await db.from("knowledge_chunks")
    .select("source_type, source_id, chunk_index, content").eq("id", id).maybeSingle();
  if (!me) return null;
  const { data: rows, error } = await db.from("knowledge_chunks")
    .select("chunk_index, content")
    .eq("source_type", me.source_type).eq("source_id", me.source_id)
    .gte("chunk_index", me.chunk_index).lte("chunk_index", me.chunk_index + 40)
    .order("chunk_index");
  if (error || !rows?.length) return null;

  const firstLine = (s: string) => s.split("\n")[0].trim();
  const heading = isHeading(me.content) ? firstLine(me.content) : "";
  const paragraphs: string[] = [];
  for (const [i, r] of rows.entries()) {
    if (r.chunk_index !== me.chunk_index + i) break;                  // a gap
    const top = firstLine(r.content);
    if (i > 0 && (heading ? top !== heading : isHeading(r.content))) break;  // next section
    const lines = r.content.split("\n").slice(heading && top === heading ? 1 : 0);
    // Lines are sentences or broken PDF lines: join them into one paragraph,
    // keeping sub-headings ("THE CHRIST OF THE BIBLE") on their own line.
    let para = "";
    for (const line of lines.map((l: string) => l.trim()).filter(Boolean)) {
      if (isHeading(line)) {
        if (para) paragraphs.push(para);
        paragraphs.push(line);
        para = "";
      } else {
        para += (para ? " " : "") + line;
      }
    }
    if (para) paragraphs.push(para);
  }

  const pages: string[][] = [];
  let page: string[] = [];
  let length = 0;
  for (const p of paragraphs) {
    if (page.length && length + p.length > size) { pages.push(page); page = []; length = 0; }
    page.push(p);
    length += p.length;
  }
  if (page.length) pages.push(page);
  if (part >= pages.length) return { text: "", more: false };
  const title = heading ? `${heading}${part ? " (continued)" : ""}\n\n` : "";
  return { text: title + pages[part].join("\n\n"), more: part < pages.length - 1 };
}

export async function searchPassages(
  db: SupabaseClient,
  text: string,
  opts: { churchId?: string | null; moduleId?: number | null; count?: number } = {}
): Promise<{ results: Ranked[]; analysis: Analysis; vector: number[] | null; error: string | null }> {
  const { text: fixed } = await correctQuestion(db, text);
  const analysis = analyzeQuestion(fixed);
  const vector = await embedQuery(fixed);
  const { data, error } = await db.rpc("search_knowledge", {
    q_terms: analysis.searchTerms,
    q_embedding: vector ? toVector(vector) : null,
    p_church: opts.churchId ?? null,
    match_count: opts.count ?? 6,
    ...(opts.moduleId ? { p_module: opts.moduleId } : {}),
  });
  if (error) return { results: [], analysis, vector, error: error.message };
  const hits = await fillSimilarity((data || []) as Hit[], vector);
  return { results: rerank(hits, analysis), analysis, vector, error: null };
}

// Up to 3 questions to tap under an answer: the next and previous sections
// of the same document, and other sections the search found close to the
// question. Each comes from a real heading, so it has an answer.
//   numbered  "What is in chapter N?" is answered (not inside one lesson)
//   asked     questions already asked in this chat, left out
export async function relatedQuestions(
  db: SupabaseClient, best: Hit, others: Hit[], opts: { numbered: boolean; asked: string[] }
): Promise<Related[]> {
  const firstLine = (s: string) => s.split("\n")[0].trim();
  const headingOf = (s: string) => (isHeading(s) ? firstLine(s) : "");
  const own = headingOf(best.content);
  const found: { heading: string; type: Hit["source_type"] }[] = [];

  let prev = "", next = "";
  if (best.id > 0) {
    const { data: me } = await db.from("knowledge_chunks")
      .select("source_type, source_id, chunk_index").eq("id", best.id).maybeSingle();
    if (me) {
      const { data: rows } = await db.from("knowledge_chunks")
        .select("chunk_index, content")
        .eq("source_type", me.source_type).eq("source_id", me.source_id)
        .gte("chunk_index", me.chunk_index - 30).lte("chunk_index", me.chunk_index + 30)
        .order("chunk_index");
      for (const r of rows || []) {
        const h = headingOf(r.content);
        if (!h || h === own || looksLikeContents(r.content)) continue;
        if (r.chunk_index < me.chunk_index) prev = h;
        else if (!next) next = h;
      }
    }
  }
  if (next) found.push({ heading: next, type: best.source_type });
  for (const h of others) {
    if (h === best || (h.similarity ?? 0) < 0.8) continue;
    const hd = headingOf(h.content);
    if (hd && hd !== own) found.push({ heading: hd, type: h.source_type });
  }
  if (prev) found.push({ heading: prev, type: best.source_type });

  const seen = new Set(opts.asked.map((q) => normalize(q)));
  const out: Related[] = [];
  for (const f of found) {
    const r = headingQuestion(f.heading, opts.numbered && f.type === "document");
    if (!r || seen.has(normalize(r.question)) || seen.has(normalize(r.label))) continue;
    seen.add(normalize(r.question));
    out.push(r);
    if (out.length === 3) break;
  }
  return out;
}
