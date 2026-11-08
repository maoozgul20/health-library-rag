// A small TF-IDF that mirrors scikit-learn's TfidfVectorizer() defaults, the one used
// in Step 8 of the notebook: lowercase, tokens of 2+ word characters, smooth idf,
// raw term counts, L2-normalised rows.

const TOKEN = /[\p{L}\p{N}_]{2,}/gu;

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN) ?? [];
}

export class TfIdf {
  private vocab = new Map<string, number>();
  private idf: Float32Array;
  /** sparse rows: for each doc, parallel arrays of term ids and weights */
  private rows: { ids: Int32Array; w: Float32Array }[] = [];

  constructor(docs: string[]) {
    const df: number[] = [];
    const counts: Map<number, number>[] = [];
    for (const d of docs) {
      const c = new Map<number, number>();
      for (const tok of tokenize(d)) {
        let id = this.vocab.get(tok);
        if (id === undefined) {
          id = this.vocab.size;
          this.vocab.set(tok, id);
          df.push(0);
        }
        c.set(id, (c.get(id) ?? 0) + 1);
      }
      for (const id of c.keys()) df[id]++;
      counts.push(c);
    }
    const n = docs.length;
    this.idf = new Float32Array(df.length);
    for (let i = 0; i < df.length; i++) this.idf[i] = Math.log((1 + n) / (1 + df[i])) + 1;

    for (const c of counts) {
      const ids = Int32Array.from(c.keys());
      const w = new Float32Array(ids.length);
      let norm = 0;
      ids.forEach((id, j) => {
        w[j] = c.get(id)! * this.idf[id];
        norm += w[j] * w[j];
      });
      norm = Math.sqrt(norm) || 1;
      for (let j = 0; j < w.length; j++) w[j] /= norm;
      this.rows.push({ ids, w });
    }
  }

  /** cosine score of the query against every document */
  scores(query: string): Float32Array {
    const q = new Map<number, number>();
    for (const tok of tokenize(query)) {
      const id = this.vocab.get(tok);
      if (id !== undefined) q.set(id, (q.get(id) ?? 0) + 1);
    }
    let norm = 0;
    for (const [id, c] of q) {
      const v = c * this.idf[id];
      q.set(id, v);
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    const out = new Float32Array(this.rows.length);
    if (q.size === 0) return out;
    this.rows.forEach((row, i) => {
      let s = 0;
      for (let j = 0; j < row.ids.length; j++) {
        const qv = q.get(row.ids[j]);
        if (qv !== undefined) s += qv * row.w[j];
      }
      out[i] = s / norm;
    });
    return out;
  }
}
