import { TfIdf } from "./tfidf";
import { SITE } from "./site";
import type { DocInfo, Hit, IndexMeta, RawChunk, SearchMode } from "./types";

/** Below this top cosine score, the notes probably do not cover the question (notebook Step 7). */
export const COVERAGE_THRESHOLD = SITE.coverageThreshold;

export type LoadedIndex = {
  meta: IndexMeta;
  docs: DocInfo[];
  chunks: RawChunk[];
  vectors: Float32Array | null;
  tfidf: TfIdf;
};

export async function loadIndex(): Promise<LoadedIndex> {
  const res = await fetch("/index/chunks.json");
  if (!res.ok) throw new Error(`Could not load the index (HTTP ${res.status}). Run "npm run index" and redeploy.`);
  const data = (await res.json()) as { meta: IndexMeta; docs: DocInfo[]; chunks: RawChunk[] };
  let vectors: Float32Array | null = null;
  if (data.meta.embeddings) {
    const v = await fetch("/index/embeddings.bin");
    if (v.ok) {
      vectors = new Float32Array(await v.arrayBuffer());
      if (vectors.length !== data.chunks.length * data.meta.dim) vectors = null;
    }
  }
  const tfidf = new TfIdf(data.chunks.map((c) => c.t));
  return { ...data, vectors, tfidf };
}

/** Exact search over every vector, the same as faiss.IndexFlatIP on normalised vectors. */
function cosineAll(index: LoadedIndex, q: Float32Array): Float32Array {
  const { vectors, meta } = index;
  const n = index.chunks.length;
  const out = new Float32Array(n);
  if (!vectors) return out;
  const d = meta.dim;
  for (let i = 0; i < n; i++) {
    let s = 0;
    const off = i * d;
    for (let j = 0; j < d; j++) s += vectors[off + j] * q[j];
    out[i] = s;
  }
  return out;
}

function topIds(scores: Float32Array, k: number): number[] {
  return Array.from(scores.keys())
    .sort((a, b) => scores[b] - scores[a])
    .slice(0, k);
}

export function search(
  index: LoadedIndex,
  question: string,
  queryVector: Float32Array | null,
  mode: SearchMode,
  k: number,
): Hit[] {
  const sem = queryVector ? cosineAll(index, queryVector) : null;
  const key = index.tfidf.scores(question);

  let ranked: { id: number; score: number }[];
  if (mode === "semantic" && sem) {
    ranked = topIds(sem, k).map((id) => ({ id, score: sem[id] }));
  } else if (mode === "hybrid" && sem) {
    // Step 8 of the notebook: 20 candidates from each retriever, keyword scores scaled
    // by their max, summed, best k kept.
    const candidates = 20;
    const combined = new Map<number, number>();
    for (const id of topIds(sem, candidates)) combined.set(id, sem[id]);
    const keyTop = topIds(key, candidates).filter((id) => key[id] > 0);
    const maxKey = keyTop.length ? key[keyTop[0]] : 1;
    for (const id of keyTop) combined.set(id, (combined.get(id) ?? 0) + key[id] / maxKey);
    ranked = [...combined.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([id, score]) => ({ id, score }));
  } else {
    ranked = topIds(key, k)
      .filter((id) => key[id] > 0)
      .map((id) => ({ id, score: key[id] }));
  }

  return ranked.map(({ id, score }) => {
    const c = index.chunks[id];
    const doc = index.docs[c.s];
    return {
      id,
      text: c.t,
      source: doc.file,
      docTitle: doc.title,
      semantic: sem ? sem[id] : null,
      keyword: key[id],
      score,
    };
  });
}

/** The augmented prompt from Step 5 of the notebook, with numbered sources. */
export function buildPrompt(question: string, passages: { source: string; text: string }[]): string {
  let context = "";
  passages.forEach((p, i) => {
    context += `\n[Source ${i + 1}: ${p.source}]\n${p.text}\n`;
  });
  return (
    "Answer the question using ONLY the context below. " +
    'If the answer is not in the context, say "I do not know". ' +
    "Do not guess. Cite the source number for each fact you use, in square brackets, like [1] or [2].\n" +
    `\nContext:${context}` +
    `\nQuestion: ${question}\nAnswer:`
  );
}
