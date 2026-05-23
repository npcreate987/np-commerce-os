/**
 * Tiny TF-IDF + cosine-similarity helper, dependency-free.
 *
 * Designed for product-similarity ranking on small corpora (≤10k docs in-memory).
 * For larger scale move to a real vector store (pgvector / Qdrant).
 *
 *   const corpus = [
 *     { id: 'p1', text: 'iPhone 15 Pro Max กล้อง 48MP' },
 *     { id: 'p2', text: 'Samsung Galaxy S24 Ultra' },
 *     ...
 *   ];
 *   const index = buildTfidf(corpus);
 *   const top = topSimilar(index, 'p1', 5);
 */

const THAI_TOKEN_RE = /[\u0E00-\u0E7F]+|[a-zA-Z0-9]+/g;

// Very common Thai stop-words / fillers in product titles
const STOP = new Set([
  'และ',
  'หรือ',
  'ของ',
  'ที่',
  'จาก',
  'พร้อม',
  'แบบ',
  'รุ่น',
  'สำหรับ',
  'มี',
  'ขนาด',
  'ใหม่',
  'the',
  'a',
  'an',
  'of',
  'for',
  'and',
  'or',
  'with',
  'new',
  'pcs',
  'pc',
  'set',
  'pack',
]);

export function tokenize(text: string): string[] {
  if (!text) return [];
  const matches = text.toLowerCase().match(THAI_TOKEN_RE) ?? [];
  return matches.filter((t) => t.length >= 2 && !STOP.has(t));
}

export interface CorpusDoc {
  id: string;
  text: string;
}

export interface TfidfIndex {
  /** docId → { term → tf-idf weight (normalized) } */
  vectors: Map<string, Map<string, number>>;
  /** docId → magnitude (precomputed for cosine) */
  magnitudes: Map<string, number>;
  /** term → idf */
  idf: Map<string, number>;
}

export function buildTfidf(corpus: CorpusDoc[]): TfidfIndex {
  const N = corpus.length;
  const df = new Map<string, number>();
  const tokenized = new Map<string, string[]>();

  for (const doc of corpus) {
    const tokens = tokenize(doc.text);
    tokenized.set(doc.id, tokens);
    const uniq = new Set(tokens);
    for (const t of uniq) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const idf = new Map<string, number>();
  for (const [t, n] of df) {
    // smoothed idf
    idf.set(t, Math.log((N + 1) / (n + 1)) + 1);
  }

  const vectors = new Map<string, Map<string, number>>();
  const magnitudes = new Map<string, number>();

  for (const doc of corpus) {
    const tokens = tokenized.get(doc.id) ?? [];
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

    const vec = new Map<string, number>();
    let mag2 = 0;
    for (const [t, freq] of tf) {
      const w = (freq / tokens.length) * (idf.get(t) ?? 0);
      if (w > 0) {
        vec.set(t, w);
        mag2 += w * w;
      }
    }
    vectors.set(doc.id, vec);
    magnitudes.set(doc.id, Math.sqrt(mag2));
  }

  return { vectors, magnitudes, idf };
}

export function cosineSim(
  index: TfidfIndex,
  aId: string,
  bId: string,
): number {
  const a = index.vectors.get(aId);
  const b = index.vectors.get(bId);
  if (!a || !b) return 0;
  const magA = index.magnitudes.get(aId) ?? 0;
  const magB = index.magnitudes.get(bId) ?? 0;
  if (magA === 0 || magB === 0) return 0;
  // iterate smaller map
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, wa] of s) {
    const wb = l.get(t);
    if (wb) dot += wa * wb;
  }
  return dot / (magA * magB);
}

export interface SimResult {
  id: string;
  score: number;
}

/** Top-K similar docs to seed, excluding itself */
export function topSimilar(
  index: TfidfIndex,
  seedId: string,
  k: number,
): SimResult[] {
  if (!index.vectors.has(seedId)) return [];
  const results: SimResult[] = [];
  for (const otherId of index.vectors.keys()) {
    if (otherId === seedId) continue;
    const s = cosineSim(index, seedId, otherId);
    if (s > 0) results.push({ id: otherId, score: s });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, k);
}
