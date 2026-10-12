import type { SupabaseClient } from "@supabase/supabase-js";
import { tokenize, isStopWord, synonymWords } from "@/app/lib/nlp";

// Spell-check for assistant questions. The dictionary is the church's own
// material — every word in the search index (db/036) plus the synonym
// list — so it knows "ikapu", "Meycauayan" and ministry names, not just
// English. A word that isn't in the dictionary is replaced by the closest
// word that is ("chech" → "check"), allowing 1 typo in short words and 2 in
// long ones; ties go to the word used in more passages.

type Vocab = { words: Map<string, number>; byLength: Map<number, string[]> };

let cache: { vocab: Vocab; at: number } | null = null;
const TTL = 10 * 60 * 1000;   // new documents join the dictionary within 10 minutes

async function loadVocabulary(db: SupabaseClient): Promise<Vocab | null> {
  if (cache && Date.now() - cache.at < TTL) return cache.vocab;
  const { data, error } = await db.rpc("knowledge_vocabulary");
  if (error) return cache?.vocab ?? null;          // db/036 not run yet → no spell-check

  const words = new Map<string, number>();
  for (const r of (data || []) as { word: string; ndoc: number }[]) words.set(r.word, r.ndoc);
  for (const w of synonymWords()) if (!words.has(w)) words.set(w, 1);

  const byLength = new Map<number, string[]>();
  for (const w of words.keys()) {
    const list = byLength.get(w.length) || [];
    list.push(w);
    byLength.set(w.length, list);
  }
  const vocab = { words, byLength };
  cache = { vocab, at: Date.now() };
  return vocab;
}

// Edit distance with swapped neighbours counted as one typo ("recieve").
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

function correctWord(word: string, vocab: Vocab): string | null {
  if (word.length < 4 || /\d/.test(word) || vocab.words.has(word) || isStopWord(word)) return null;
  const max = word.length <= 7 ? 1 : 2;
  let best: string | null = null;
  let bestDist = max + 1;
  let bestFreq = -1;
  for (let len = word.length - max; len <= word.length + max; len++) {
    for (const cand of vocab.byLength.get(len) || []) {
      if (cand[0] !== word[0] && max === 1) continue;   // short words: keep the first letter
      const dist = distance(word, cand, max);
      const freq = vocab.words.get(cand) || 0;
      if (dist < bestDist || (dist === bestDist && freq > bestFreq)) {
        best = cand; bestDist = dist; bestFreq = freq;
      }
    }
  }
  return bestDist <= max ? best : null;
}

// Returns the question with typos fixed, and what was changed.
export async function correctQuestion(db: SupabaseClient, question: string): Promise<{ text: string; fixes: Record<string, string> }> {
  const vocab = await loadVocabulary(db);
  if (!vocab) return { text: question, fixes: {} };

  const fixes: Record<string, string> = {};
  for (const w of new Set(tokenize(question))) {
    const fixed = correctWord(w, vocab);
    if (fixed) fixes[w] = fixed;
  }
  if (!Object.keys(fixes).length) return { text: question, fixes };

  const text = question.replace(/[A-Za-zÀ-ÿ]+/g, (m) => fixes[m.toLowerCase()] ?? m);
  return { text, fixes };
}
