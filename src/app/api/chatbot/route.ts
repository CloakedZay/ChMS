import { NextRequest, NextResponse } from "next/server";
import { getCaller, resolveChurchId } from "@/app/lib/apiAuth";
import { analyzeQuestion, detectIntent, pickAnswer, coverage, splitSentences, tokenize, type Analysis } from "@/app/lib/nlp";
import { embedQuery, embedPassages, toVector } from "@/app/lib/embeddings";
import { correctQuestion } from "@/app/lib/spelling";
import { rerank, type Hit } from "@/app/lib/assistantSearch";
import { loadJourney, describeProgress, describeLessonProgress, findModule, describeModule } from "@/app/lib/discipleship";

export const runtime = "nodejs";
export const maxDuration = 60;

// The church assistant. No outside AI service: it understands the question
// with lib/nlp (English + Tagalog), finds passages with the hybrid search in
// the database (db/035: keywords + meaning + typo-tolerant), and answers
// with the most relevant sentences, naming the document or handout they
// came from. It never makes text up — if nothing fits, it says so.

type Source = { title: string; subtitle: string | null; type: "document" | "handout"; excerpt: string };
// (Hit and the re-ranking live in lib/assistantSearch, shared with "Related reading".)

const looksTagalog = (q: string) =>
  /\b(po|ang|ng|mga|sa|ano|paano|saan|kailan|bakit|sino|ba|naman|kumusta|kamusta|salamat)\b/i.test(q);

function reply(answer: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ answer, sources: [], ...extra });
}

// ── Chapter / article requests ("what is in article 3") ─────────────────────
function toRoman(num: number): string {
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let result = "";
  for (const [value, symbol] of table) while (num >= value) { result += symbol; num -= value; }
  return result;
}

function chunkByParagraph(content: string): string[] {
  const chunks = content.split(/\n\s*\n+/).map((c) => c.trim()).filter((c) => c && !/table of contents/i.test(c));
  return chunks.length ? chunks : [content];
}

function findHeadingChunk(content: string, n: number): string | null {
  const roman = toRoman(n);
  const re = new RegExp(`^(?:(?:article|chapter|section)\\s+)?(?:${roman}|${n})[.:)]\\s`, "im");
  return chunkByParagraph(content).find((c) => re.test(c)) ?? null;
}

// ── Before db/035 is run: the old word-count search ──────────────────────────
function legacySearch(docs: { title: string; doc_type: string; content: string }[], analysis: Analysis): Source[] {
  const words = analysis.searchTerms;
  if (!words.length) return [];
  const score = (text: string) => {
    const lower = text.toLowerCase();
    return words.reduce((s, w) => s + (lower.split(w).length - 1), 0);
  };
  return docs
    .flatMap((d) => chunkByParagraph(d.content).map((text) => ({ d, text, s: score(text) + (score(d.title) > 0 ? 5 : 0) })))
    .filter((c) => c.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map(({ d, text }) => ({ title: d.title, subtitle: d.doc_type, type: "document" as const, excerpt: text }));
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getCaller(req);
    if (caller instanceof NextResponse) return caller;

    const { question: raw, church_id: requestedChurch, module_id: rawModule } = await req.json();
    const question = String(raw || "").trim().slice(0, 500);
    const church_id = resolveChurchId(caller, requestedChurch);
    if (!question) return NextResponse.json({ error: "Missing question" }, { status: 400 });

    // "Ask about this lesson": answer only from one module (db/037).
    const moduleId = rawModule != null && /^\d+$/.test(String(rawModule)) ? Number(rawModule) : null;
    let lesson: { id: number; title: string; description: string | null } | null = null;
    if (moduleId) {
      const { data } = await caller.db.from("discipleship_modules")
        .select("id, title, description").eq("id", moduleId).maybeSingle();
      if (!data) return NextResponse.json({ error: "Module not found" }, { status: 404 });
      lesson = data;
    }

    const tl = looksTagalog(question);
    const intent = detectIntent(question);

    // ── Small talk ──────────────────────────────────────────────────────────
    if (intent.kind === "greeting") {
      return reply(tl
        ? "Kumusta po! Magtanong lang po tungkol sa simbahan — hahanapin ko ang sagot sa mga dokumento at handouts ng church."
        : "Hello! Ask me anything about the church — I'll look for the answer in the church's documents and discipleship handouts.");
    }
    if (intent.kind === "thanks") return reply(tl ? "Walang anuman po! May iba pa po ba kayong tanong?" : "You're welcome! Anything else you'd like to know?");
    if (intent.kind === "goodbye") return reply(tl ? "Paalam po, God bless!" : "Goodbye, God bless!");
    if (intent.kind === "help" || intent.kind === "empty") {
      return reply(
        "I answer questions from the church's own materials: the documents uploaded in Assistant → Documents and the discipleship handouts in Training.\n\n" +
        "Try things like:\n• What time is the Sunday service?\n• How do I join a ministry?\n• Ano ang ikapu?\n• What is in Article 3?\n• What's my next module?\n• What is module 2 about?\n\n" +
        "I answer from that material only. If something isn't written down there, I'll tell you so you can ask a pastor."
      );
    }

    // ── My discipleship journey ─────────────────────────────────────────────
    if (intent.kind === "progress" || intent.kind === "module") {
      const groups = await loadJourney(caller.db, caller.userId);
      if (intent.kind === "progress") {
        // Inside a lesson: where they stand in THIS module and what opens next.
        const here = lesson ? describeLessonProgress(groups, lesson.id, tl) : null;
        return reply(here || describeProgress(groups, tl), { confidence: "high" });
      }
      const found = findModule(groups, intent.number, question);
      if (found) return reply(describeModule(found.group, found.module, tl), { confidence: "high" });
      const total = groups.find((g) => !g.ministryId)?.modules.length ?? 0;
      return reply(tl
        ? `Walang Module ${intent.number}${total ? ` — may ${total} module ang Discipleship path ninyo` : ""}.`
        : `There's no Module ${intent.number}${total ? ` — your Discipleship path has ${total} module${total === 1 ? "" : "s"}` : ""}.`);
    }

    // ── "What is in chapter / article N" ───────────────────────────────────
    if (intent.kind === "chapter" && church_id && !lesson) {
      const { data: docs } = await caller.db.from("chatbot_documents")
        .select("title, content, doc_type").eq("church_id", church_id).eq("is_active", true);
      const found = (docs || [])
        .map((d) => ({ d, text: findHeadingChunk(d.content, intent.number) }))
        .filter((x): x is { d: typeof x.d; text: string } => !!x.text);
      if (found.length) {
        return NextResponse.json({
          answer: found[0].text,
          sources: found.slice(0, 3).map(({ d, text }) => ({ title: d.title, subtitle: d.doc_type, type: "document", excerpt: text })),
          confidence: "high",
        });
      }
      // otherwise fall through to a normal search
    }

    // Fix typos against the church's own vocabulary ("chech" → "check").
    const { text: fixedQuestion } = await correctQuestion(caller.db, question);
    const analysis = analyzeQuestion(fixedQuestion);
    if (!analysis.words.length) {
      return reply(tl
        ? "Pakisabi po nang mas tiyak ang tanong — halimbawa: “Anong oras ang pagsamba sa Linggo?”"
        : "Could you ask a bit more specifically? For example: “What time is the Sunday service?”");
    }

    // ── Hybrid search ──────────────────────────────────────────────────────
    const vector = await embedQuery(fixedQuestion);
    const { data: dbHits, error } = await caller.db.rpc("search_knowledge", {
      q_terms: analysis.searchTerms,
      q_embedding: vector ? toVector(vector) : null,
      p_church: church_id,
      match_count: 6,
      ...(lesson ? { p_module: lesson.id } : {}),
    });

    if (error && lesson) {
      return reply("Asking about a single lesson isn't set up yet. Ask the administrator to run db/037_search_one_module.sql.");
    }
    if (error) {
      // Search index not set up yet (db/035) → old keyword search on documents.
      if (!/search_knowledge|does not exist|schema cache/i.test(error.message)) throw error;
      const { data: docs } = await caller.db.from("chatbot_documents")
        .select("title, content, doc_type").eq("church_id", church_id).eq("is_active", true);
      const sources = legacySearch(docs || [], analysis);
      if (!sources.length) {
        return reply("I couldn't find anything about that in the uploaded documents. Try rephrasing, or ask a pastor directly.");
      }
      return NextResponse.json({ answer: pickAnswer(sources[0].excerpt, analysis), sources, confidence: "medium", mode: "keyword" });
    }

    // In a lesson, its own description is a passage too.
    const hits = [...((dbHits || []) as Hit[])];
    if (lesson?.description?.trim()) {
      const text = `${lesson.title}\n${lesson.description.trim()}`;
      const dv = vector ? await embedPassages([text]) : null;
      hits.push({
        id: -1, source_type: "handout", source_id: `module-${lesson.id}`, title: lesson.title, subtitle: "Module description",
        content: lesson.description.trim(), text_rank: coverage(text, analysis) > 0 ? 0.1 : 0,
        similarity: dv && vector ? dv[0].reduce((s, x, i) => s + x * vector[i], 0) : null, fuzzy: 0, score: 0,
      });
    }

    const results = rerank(hits, analysis);
    const best = results[0];
    const bestCoverage = best ? best.cov : 0;
    const sim = best?.similarity ?? 0;

    // Is the best passage actually about the question? Tuned on real tests:
    // related questions score ≥ 0.81 in meaning AND share their key words with
    // the passage; off-topic ones ("how do I add in finance", "what's inside
    // reports", "bake bread") score 0.76–0.82 with few or chance word matches.
    //   * meaning ≥ 0.81 and at least half the question's words (synonyms count), or
    //   * meaning ≥ 0.79 and all its words (2+ words), or ≥ 0.84 for one word, or
    //   * meaning ≥ 0.88 alone (e.g. Tagalog question, English passage)
    //   * no model available: a keyword hit covering 2/3 of the words
    const exact = best?.exact ?? 0;
    const manyWords = analysis.words.length >= 2;
    //   * inside one lesson, the passage must share at least one word — a
    //     short module description is "similar" to almost any short question
    const relevant = !!best && (vector
      ? (sim >= 0.81 && Math.max(exact, bestCoverage) >= 0.5)
        || (exact >= 0.99 && sim >= (manyWords ? 0.79 : 0.84))
        || (sim >= 0.88 && (!lesson || Math.max(exact, bestCoverage) > 0))
      : best.text_rank > 0 && Math.max(exact, bestCoverage) >= 0.67);
    if (!relevant) {
      const nothingIndexed = results.length === 0;
      if (lesson) {
        return reply(tl
          ? `Wala po akong nakitang sagot diyan sa mga handout ng “${lesson.title}”. Subukang itanong sa ibang paraan, gamitin ang pangunahing Assistant, o magtanong sa inyong leader.`
          : `I couldn't find that in the handouts for “${lesson.title}”. Try asking another way, use the main Assistant, or ask your leader.`,
          { confidence: "none" });
      }
      return reply(
        nothingIndexed && !vector
          ? "I couldn't find anything about that. If documents or handouts were added recently, ask a pastor or leader to press “Rebuild search index” in Assistant → Documents."
          : tl
            ? "Pasensya na po, wala akong nakitang sagot diyan sa mga dokumento at handouts ng simbahan. Subukang itanong sa ibang paraan, o magtanong po sa pastor."
            : "Sorry, I couldn't find that in the church's documents or handouts. Try asking another way, or ask a pastor directly.",
        { confidence: "none" }
      );
    }

    const confidence = (sim >= 0.84 && exact >= 0.5) || (sim >= 0.8 && exact >= 0.99) || sim >= 0.9 ? "high" : "medium";

    // Up to 3 sources, one passage each, best first; drop weak extras.
    const seen = new Set<string>();
    const seenText = new Set<string>();
    const sources: Source[] = [];
    for (const h of results) {
      const key = `${h.source_type}:${h.source_id}`;
      // The same file uploaded twice gives identical passages — show it once.
      const textKey = tokenize(h.content).slice(0, 40).join(" ");
      if (seen.has(key) || seenText.has(textKey)) continue;
      const hSim = h.similarity ?? 0;
      const strongEnough = h === best || hSim >= Math.max(0.8, sim - 0.03) || (h.text_rank > 0 && h.cov >= 0.5);
      if (!strongEnough) continue;
      seen.add(key);
      seenText.add(textKey);
      sources.push({ title: h.title, subtitle: h.subtitle, type: h.source_type, excerpt: h.content.slice(0, 1500) });
      if (sources.length === 3) break;
    }

    // Choose the answer sentences by meaning too, when the model is available.
    let sentenceSims: number[] | null = null;
    if (vector) {
      const sv = await embedPassages(splitSentences(best.content));
      if (sv) sentenceSims = sv.map((v) => v.reduce((s, x, i) => s + x * vector[i], 0));
    }
    let answer = pickAnswer(best.content, analysis, 3, sentenceSims);
    // A very short extract (a heading) reads badly; use more of the passage.
    if (tokenize(answer).length < 8) answer = best.content.slice(0, 600);
    if (confidence === "medium") answer = (tl ? "Ito po ang pinakamalapit na nakita ko:\n\n" : "Here's the closest thing I found:\n\n") + answer;

    return NextResponse.json({ answer, sources, confidence, mode: vector ? "meaning+keyword" : "keyword" });
  } catch (err) {
    console.error("Chatbot API error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
