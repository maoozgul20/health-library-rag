export type DocInfo = {
  file: string;
  title: string;
  kind: string;
  chars: number;
  chunks: number;
  firstChunk: number;
};

export type IndexMeta = {
  hash: string;
  model: string;
  dtype: string;
  dim: number;
  chunkSize: number;
  chunkOverlap: number;
  totalChars: number;
  avgChunk: number;
  maxChunk: number;
  minChunk: number;
  embeddings: boolean;
  builtAt: string;
};

export type RawChunk = { t: string; s: number };

export type SearchMode = "semantic" | "hybrid" | "keyword";

export type Hit = {
  id: number;
  text: string;
  source: string;
  docTitle: string;
  /** cosine similarity to the question, when embeddings exist */
  semantic: number | null;
  /** TF-IDF cosine, 0..1 */
  keyword: number;
  /** the score this hit was ranked by in the chosen mode */
  score: number;
};

export type ContextPassage = { source: string; text: string };
