import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/app/lib/apiAuth";
import { searchPassages } from "@/app/lib/assistantSearch";
import { embedPassages } from "@/app/lib/embeddings";
import { pickAnswer, splitSentences } from "@/app/lib/nlp";

export const runtime = "nodejs";
export const maxDuration = 60;

// The handout passages of one module that relate to a piece of text.
//   * members — "Related reading" under a lesson question: where to read,
//     not the answer itself
//   * Pastor / Leaders — "What the handout says" next to an answer they
//     are reviewing
// Members only get modules they may see; the database checks that (db/035).
export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (caller instanceof NextResponse) return caller;

  const { module_id, text } = await req.json().catch(() => ({}));
  const moduleId = /^\d+$/.test(String(module_id ?? "")) ? Number(module_id) : null;
  const query = String(text || "").trim().slice(0, 800);
  if (!moduleId || !query) return NextResponse.json({ error: "Missing module_id or text" }, { status: 400 });

  const { results, analysis, vector, error } = await searchPassages(caller.db, query, { moduleId, count: 6 });
  if (error) {
    const missing = /search_knowledge|does not exist|schema cache|p_module/i.test(error);
    return NextResponse.json({ passages: [], setup: missing ? "Run db/035 and db/037 in Supabase." : error });
  }

  // Lesson questions are long ("Explain in your own words…"), so they share
  // fewer words with the handout than a chat question would: a meaning match
  // plus some shared words is enough here.
  const relevant = results.filter((r) => {
    const words = Math.max(r.exact, r.cov);
    const sim = r.similarity ?? 0;
    return vector ? (sim >= 0.8 && words >= 0.2) || sim >= 0.86 : r.text_rank > 0 && words >= 0.34;
  });

  const passages = [];
  const seen = new Set<string>();
  for (const r of relevant) {
    if (seen.has(r.source_id)) continue;            // one passage per handout
    seen.add(r.source_id);
    let sims: number[] | null = null;
    if (vector) {
      const sv = await embedPassages(splitSentences(r.content));
      if (sv) sims = sv.map((v) => v.reduce((s, x, i) => s + x * vector[i], 0));
    }
    passages.push({
      title: r.title,
      subtitle: r.subtitle,
      excerpt: pickAnswer(r.content, analysis, 4, sims),
      full: r.content,
    });
    if (passages.length === 2) break;
  }

  return NextResponse.json({ passages });
}
