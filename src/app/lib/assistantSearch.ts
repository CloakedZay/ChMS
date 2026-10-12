import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeQuestion, coverage, exactCoverage, type Analysis } from "@/app/lib/nlp";
import { embedQuery, toVector } from "@/app/lib/embeddings";
import { correctQuestion } from "@/app/lib/spelling";

// Shared search step of the assistant: clean the text, search the index
// (db/035, db/037 for one module), and re-rank. Used by the chatbot answer
// route and by "Related reading" / "What the handout says".

export type Hit = {
  id: number; source_type: "document" | "handout"; source_id: string; title: string; subtitle: string | null;
  content: string; text_rank: number; similarity: number | null; fuzzy: number; score: number;
};
export type Ranked = Hit & { exact: number; cov: number; rank: number };

// Meaning first, then how many of the question's OWN words a passage has
// (so "prayer meeting" beats a lesson that only matches the synonyms of
// "prayer"), then synonym coverage.
export function rerank(hits: Hit[], analysis: Analysis): Ranked[] {
  return hits
    .map((h) => {
      const text = `${h.title} ${h.content}`;
      const exact = exactCoverage(text, analysis);
      const cov = coverage(text, analysis);
      const rank = h.similarity != null
        ? h.similarity + 0.15 * exact + 0.05 * cov + (h.text_rank > 0 ? 0.02 : 0)
        : exact + 0.5 * cov + Math.min(h.text_rank, 1) + 0.3 * h.fuzzy;
      return { ...h, exact, cov, rank };
    })
    .sort((a, b) => b.rank - a.rank);
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
  return { results: rerank((data || []) as Hit[], analysis), analysis, vector, error: null };
}
