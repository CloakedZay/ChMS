// Natural-language processing for the church assistant. Runs on the server,
// no outside service. Used in two places:
//   * indexing — split documents / handouts into passages (chunkText)
//   * answering — understand the question (analyzeQuestion), then pick the
//     sentences that best answer it from the passages search returned
//     (pickAnswer)
//
// English + Tagalog / Taglish: stop-words, light stemming for both, and a
// synonym list of church words so "ikapu" finds "tithe" and "manalangin"
// finds "prayer". Add church-specific words to SYNONYM_GROUPS as needed.

// ── Stop-words ──────────────────────────────────────────────────────────────
const STOP_EN = new Set(`a an the is are was were be been being am do does did doing have has had having
i me my mine myself you your yours we our ours us he him his she her it its they them their
what which who whom whose when where why how this that these those there here
of to in on at by for with about against between into through during before after above below from up down out off over under
and or but if then else so than too very can could will would shall should may might must
not no nor only own same just also any some each every all both few more most other such
please tell explain describe discuss summarize summarise mean meaning means understand know want need
thing things something anything ok okay hi hello hey thanks thank
whats whos wheres whens hows thats theres inside`.split(/\s+/));

const STOP_TL = new Set(`ang ng mga sa na at ay si ni kay kina sina nina ko mo niya natin namin ninyo nila
ako ikaw ka siya tayo kami kayo sila ito iyan iyon dito diyan doon
ano anong ano-ano sino sinong saan kailan bakit paano paanong gaano ilan alin aling
po ho ba naman din rin lang lamang pa na nga daw raw kasi kung kapag pag para upang dahil
may mayroon meron wala hindi huwag oo opo
yung yun iyong iyung yan yon dun dyan
akin iyo kanya atin amin inyo kanila nag mag pag naka maka
gusto nais alam pakisabi pakipaliwanag ipaliwanag sabihin`.split(/\s+/));

// ── Synonyms (each group = words that should find each other) ──────────────
const SYNONYM_GROUPS: string[][] = [
  ['tithe', 'tithes', 'tithing', 'ikapu', 'ikapo', 'ikasampu'],
  ['offering', 'offerings', 'handog', 'alay', 'abuloy', 'donation', 'donate', 'give', 'giving', 'ibigay', 'magbigay'],
  ['love gift', 'lovegift', 'love', 'gift', 'regalo'],
  ['pray', 'prayer', 'prayers', 'praying', 'panalangin', 'manalangin', 'dasal', 'magdasal', 'dalangin'],
  ['worship', 'service', 'pagsamba', 'sumamba', 'serbisyo', 'mass'],
  ['church', 'simbahan', 'iglesia', 'congregation', 'kongregasyon'],
  ['god', 'diyos', 'dios', 'lord', 'panginoon', 'ama'],
  ['jesus', 'hesus', 'christ', 'kristo', 'cristo', 'savior', 'tagapagligtas'],
  ['holy spirit', 'spirit', 'espiritu', 'banal'],
  ['bible', 'biblia', 'bibliya', 'scripture', 'scriptures', 'kasulatan', 'word'],
  ['faith', 'believe', 'belief', 'pananampalataya', 'manampalataya', 'sumampalataya', 'paniniwala'],
  ['sin', 'sins', 'kasalanan', 'nagkasala'],
  ['salvation', 'saved', 'save', 'kaligtasan', 'maligtas', 'ligtas'],
  ['forgive', 'forgiveness', 'kapatawaran', 'patawad', 'patawarin'],
  ['repent', 'repentance', 'pagsisisi', 'magsisi'],
  ['grace', 'biyaya', 'grasya'],
  ['baptism', 'baptize', 'baptized', 'bautismo', 'binyag', 'bawtismo', 'magpabautismo'],
  ['heaven', 'langit', 'kalangitan'],
  ['family', 'pamilya', 'mag-anak'],
  ['marriage', 'married', 'kasal', 'pag-aasawa', 'asawa'],
  ['member', 'members', 'membership', 'miyembro', 'kaanib', 'kasapi'],
  ['ministry', 'ministries', 'ministeryo'],
  ['pastor', 'pastora', 'minister', 'shepherd'],
  ['leader', 'leaders', 'lider', 'pinuno'],
  ['disciple', 'discipleship', 'disipulo', 'alagad', 'pagdidisipulo'],
  ['schedule', 'time', 'oras', 'iskedyul', 'kailan', 'when'],
  ['sunday', 'linggo'],
  ['saturday', 'sabado'],
  ['youth', 'kabataan', 'young'],
  ['children', 'kids', 'bata', 'mga bata'],
  ['fellowship', 'pagsasama', 'samahan'],
  ['study', 'pag-aaral', 'aral', 'lesson', 'aralin'],
  ['evangelism', 'evangelize', 'ebanghelyo', 'gospel', 'mabuting balita'],
  ['mission', 'missions', 'misyon'],
  ['money', 'pera', 'funds', 'fund', 'pondo', 'finance'],
  ['join', 'joining', 'sumali', 'sali', 'magsimba', 'attend', 'dumalo'],
  ['rules', 'policy', 'policies', 'patakaran', 'alituntunin', 'bylaws', 'constitution'],
  ['help', 'tulong', 'tumulong', 'assist'],
];

// word → all words in its group (single words only; phrases also kept whole)
const SYNONYMS = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  const words = group.flatMap((g) => g.split(/[\s-]+/)).filter(Boolean);
  for (const w of words) {
    const prev = SYNONYMS.get(w) || [];
    SYNONYMS.set(w, [...new Set([...prev, ...words])]);
  }
}

// ── Text basics ─────────────────────────────────────────────────────────────
export function normalize(text: string): string {
  return text
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')   // ñ → n, é → e
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  return normalize(text).split(/[\s-]+/).filter(Boolean);
}

const isStop = (w: string) => STOP_EN.has(w) || STOP_TL.has(w);
export const isStopWord = isStop;

// Every single word in the synonym list (the spell-checker's extra dictionary).
export const synonymWords = (): string[] => [...SYNONYMS.keys()];

// Light English stemmer: strips the common endings so word forms meet.
function stemEnglish(w: string): string {
  if (w.length <= 3) return w;
  const rules: [RegExp, string][] = [
    [/ies$/, 'y'], [/sses$/, 'ss'], [/([^s])s$/, '$1'],
    [/eed$/, 'ee'], [/(.{3,})ing$/, '$1'], [/(.{3,})ed$/, '$1'],
    [/(.{3,})ness$/, '$1'], [/(.{3,})ment$/, '$1'], [/(.{3,})ful$/, '$1'],
    [/(.{3,})ation$/, '$1'], [/(.{3,})ly$/, '$1'],
  ];
  for (const [re, to] of rules) {
    if (re.test(w)) { w = w.replace(re, to); break; }
  }
  // praying → pray, baptiz → baptize-ish: drop a doubled final consonant
  return w.replace(/([^aeiou])\1$/, '$1');
}

// Light Tagalog stemmer, deliberately cautious so English words survive:
// only the long, unmistakable verb prefixes (pagsamba → samba, magdasal →
// dasal), the -um- infix (sumamba → samba), a doubled first vowel
// (aaral → aral) and -han/-hin endings. The same function runs on the
// question and on the passages, so an imperfect stem still matches itself.
function stemTagalog(w: string): string {
  if (w.length <= 5) return w.replace(/^([aeiou])\1/, '$1');
  let s = w.replace(/^(nakikipag|makikipag|pinaka|ipinag|nakapag|makapag|magpa|nagpa|ipag|pinag|pag|nag|mag)(?=[a-z]{4,})/, '');
  const stripped = s !== w;
  s = s.replace(/^([bcdfghklmnprstvwyz])um(?=[aeiou][a-z]{3,})/, '$1');
  s = s.replace(/(?<=[a-z]{4,})h(an|in)$/, '');
  if (stripped) s = s.replace(/^([bcdfghklmnprstvwyz]?[aeiou])\1/, '$1');   // mag-aaral, nagbabasa → basa
  s = s.replace(/^([aeiou])\1/, '$1');
  return s.length >= 3 ? s : w;
}

export function stem(word: string): string {
  return stemTagalog(stemEnglish(word));
}

// ── Questions ───────────────────────────────────────────────────────────────
export type Intent =
  | { kind: 'greeting' | 'thanks' | 'goodbye' | 'help' | 'empty' }
  | { kind: 'chapter'; number: number }
  | { kind: 'search' };

export function detectIntent(question: string): Intent {
  const q = normalize(question);
  if (!q) return { kind: 'empty' };
  if (/^(hi|hello|hey|yo|good day|kumusta|kamusta|magandang (umaga|tanghali|hapon|gabi)|good (morning|afternoon|evening))( po)?$/.test(q)) return { kind: 'greeting' };
  if (/^(how are you|kumusta ka|kamusta ka)( po)?$/.test(q)) return { kind: 'greeting' };
  if (/^(thanks?|thank you|ty|salamat|maraming salamat)( po| so much| a lot)?$/.test(q)) return { kind: 'thanks' };
  if (/^(bye|goodbye|paalam|sige)( po)?$/.test(q)) return { kind: 'goodbye' };
  if (/^(help|tulong|what can you do|ano ang kaya mo|paano ka gamitin|how do i use (this|you))( po)?$/.test(q)) return { kind: 'help' };
  const ch = question.match(/\b(?:chapter|article|section|kabanata|seksyon)\s+(\d{1,3})\b/i);
  if (ch) return { kind: 'chapter', number: parseInt(ch[1], 10) };
  return { kind: 'search' };
}

export type Analysis = {
  words: string[];      // meaningful words from the question
  stems: string[];      // their stems
  searchTerms: string[];// words + stems + synonyms, sent to the search
};

export function analyzeQuestion(question: string): Analysis {
  const words = [...new Set(tokenize(question).filter((w) => w.length >= 2 && !isStop(w)))];
  const stems = [...new Set(words.map(stem))];
  const expanded = new Set<string>([...words, ...stems]);
  for (const w of [...words, ...stems]) {
    for (const s of SYNONYMS.get(w) || []) expanded.add(s);
  }
  return {
    words,
    stems,
    searchTerms: [...expanded].filter((w) => w.length >= 2 && !isStop(w)).slice(0, 40),
  };
}

// ── Passages ────────────────────────────────────────────────────────────────
export function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, '')
    // a heading line ("WORSHIP AND MEETINGS") is its own sentence
    .replace(/^([^\n]{1,80})\n/gm, (m, line) => (isHeading(line) ? `${line}\n\n` : m))
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])|\n{2,}|\n(?=\s*(?:[-•*]|\d+[.)]|[IVXLC]+\.)\s)/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 1);
}

// A paragraph that starts a new section: "ARTICLE III. …", "Chapter 2",
// "Aralin 1", "IV. …", or a short line in capitals.
function isHeading(paragraph: string): boolean {
  const first = paragraph.split('\n')[0].trim();
  if (/^(article|chapter|section|part|lesson|aralin|kabanata|seksyon|bahagi)\s+([0-9]+|[ivxlc]+)\b/i.test(first)) return true;
  if (/^[IVXLC]+\.\s+\S/.test(first)) return true;
  const letters = first.replace(/[^A-Za-z]/g, '');
  return first.length <= 80 && letters.length >= 4 && letters === letters.toUpperCase() && !/[.!?]$/.test(first);
}

// Split a document into passages of about `target` characters. A new
// section (heading) always starts a new passage; long sections are split
// between sentences, and each continuation repeats the section heading so it
// still makes sense on its own.
export function chunkText(text: string, target = 650): string[] {
  const paragraphs = text
    .replace(/\r/g, '')
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/[ \t]+/g, ' ').trim())
    .filter((p) => p && !/^table of contents$/i.test(p));

  const chunks: string[] = [];
  let current = '';
  let heading = '';

  const push = (carryHeading: boolean) => {
    if (current.trim() && current.trim() !== heading) chunks.push(current.trim());
    current = carryHeading && heading ? heading + '\n' : '';
  };

  for (const para of paragraphs) {
    if (isHeading(para)) {
      if (current.trim().length > 0) push(false);
      heading = para.split('\n')[0].trim().slice(0, 120);
    }
    const pieces = para.length > target ? splitSentences(para) : [para];
    for (const piece of pieces) {
      if (current.length + piece.length > target && current.length > target * 0.35) push(true);
      current += (current && !current.endsWith('\n') ? '\n' : '') + piece;
    }
    current += '\n';
  }
  push(false);
  return chunks.length ? chunks : [text.trim()].filter(Boolean);
}

// ── Answers ─────────────────────────────────────────────────────────────────
// Score each sentence of the best passages by how many of the question's
// stems (and synonyms) it contains, then keep the best few in their
// original order — a short extract instead of a whole page.
export function pickAnswer(passage: string, analysis: Analysis, maxSentences = 3, sentenceSims?: number[] | null): string {
  const sentences = splitSentences(passage);
  if (sentences.length <= maxSentences) return sentences.join(' ');

  const wanted = new Set(analysis.searchTerms.map(stem));
  const scored = sentences.map((s, i) => {
    const stems = new Set(tokenize(s).map(stem));
    let hits = 0;
    for (const w of wanted) if (stems.has(w)) hits += 1;
    const lengthPenalty = s.length < 25 ? 0.5 : 1;            // fragments / bare headings
    // With meaning scores (0.7–0.9), they lead; word hits break ties.
    const meaning = sentenceSims?.[i] != null ? (sentenceSims[i] - 0.7) * 20 : 0;
    return { i, s, score: (meaning + hits) * lengthPenalty };
  });

  const best = [...scored].sort((a, b) => b.score - a.score || a.i - b.i);
  if (best[0].score <= 0) return sentences.slice(0, maxSentences).join(' ');

  // the best sentence plus close, relevant neighbours, in reading order
  const anchor = best[0].i;
  const pick = new Set<number>([anchor]);
  for (const b of best.slice(1)) {
    if (pick.size >= maxSentences) break;
    if (b.score >= best[0].score * 0.6 && Math.abs(b.i - anchor) <= 2) pick.add(b.i);
  }
  for (let d = 1; pick.size < Math.min(2, maxSentences) && d <= 1; d++) {
    if (anchor + d < sentences.length) pick.add(anchor + d);
    else if (anchor - d >= 0) pick.add(anchor - d);
  }
  // A heading goes on its own line above the text it introduces.
  return [...pick].sort((a, b) => a - b)
    .map((i) => sentences[i])
    .reduce((out, s) => {
      if (isHeading(s)) return `${out}${out ? '\n' : ''}${s}\n`;
      return `${out}${out && !out.endsWith('\n') ? ' ' : ''}${s}`;
    }, '')
    .trim();
}

// Share of the question's own words (no synonyms) found in a passage, 0–1.
export function exactCoverage(passage: string, analysis: Analysis): number {
  if (!analysis.stems.length) return 0;
  const stems = new Set(tokenize(passage).map(stem));
  return analysis.stems.filter((w) => stems.has(w)).length / analysis.stems.length;
}

// How many of the question's meaningful words a passage covers (0–1).
export function coverage(passage: string, analysis: Analysis): number {
  if (!analysis.stems.length) return 0;
  const stems = new Set(tokenize(passage).map(stem));
  const syn = (w: string) => [w, ...(SYNONYMS.get(w) || []).map(stem)];
  let hit = 0;
  for (const w of analysis.stems) if (syn(w).some((x) => stems.has(x))) hit += 1;
  return hit / analysis.stems.length;
}
