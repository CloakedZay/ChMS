// Meaning vectors ("embeddings") for the assistant's semantic search.
//
// Runs the multilingual-e5-small model ON THIS SERVER with
// @huggingface/transformers — no outside AI service, no API key, no cost.
// The model (about 120 MB) is downloaded once from Hugging Face on first
// use and cached in the server's temp folder.
//
// If the model can't load (no internet on first use, a host that doesn't
// allow the native runtime, too little memory…), every function here
// returns null and the assistant falls back to keyword search only.

import os from 'node:os';
import path from 'node:path';

export const EMBEDDING_MODEL = 'Xenova/multilingual-e5-small';
export const EMBEDDING_DIMS = 384;

type Extractor = (texts: string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

let loading: Promise<Extractor | null> | null = null;
let failedAt = 0;

async function getExtractor(): Promise<Extractor | null> {
  // After a failure, wait 10 minutes before trying to load again.
  if (failedAt && Date.now() - failedAt < 10 * 60 * 1000) return null;
  if (!loading) {
    loading = (async () => {
      try {
        const { pipeline, env } = await import('@huggingface/transformers');
        env.cacheDir = path.join(os.tmpdir(), 'faithsync-models');
        env.allowLocalModels = false;
        const fe = await pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' });
        return fe as unknown as Extractor;
      } catch (err) {
        console.error('Embedding model unavailable, using keyword search only:', err);
        failedAt = Date.now();
        loading = null;
        return null;
      }
    })();
  }
  return loading;
}

async function embed(texts: string[]): Promise<number[][] | null> {
  if (!texts.length) return [];
  const fe = await getExtractor();
  if (!fe) return null;
  try {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 16) {          // small batches keep memory low
      const res = await fe(texts.slice(i, i + 16), { pooling: 'mean', normalize: true });
      out.push(...res.tolist());
    }
    return out;
  } catch (err) {
    console.error('Embedding failed:', err);
    return null;
  }
}

// e5 models expect "query: " / "passage: " in front of the text.
export async function embedQuery(question: string): Promise<number[] | null> {
  const r = await embed([`query: ${question.slice(0, 1000)}`]);
  return r ? r[0] : null;
}

export async function embedPassages(passages: string[]): Promise<number[][] | null> {
  return embed(passages.map((p) => `passage: ${p.slice(0, 2000)}`));
}

// pgvector's text form: "[0.1,0.2,…]"
export const toVector = (v: number[]) => `[${v.map((x) => x.toFixed(6)).join(',')}]`;
