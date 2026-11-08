// Builds the retrieval index the website searches.
//
//   data/docs/*.txt  ->  public/index/chunks.json      (chunk text, source file, document list)
//                    ->  public/index/embeddings.bin   (Float32, one 384-number vector per chunk)
//
// Runs automatically before `next build` (see "prebuild" in package.json), so every
// Vercel deploy rebuilds the index from whatever is in data/docs. It skips the slow
// embedding step when the corpus has not changed since the last run.
//
// Embeddings use the same model as the notebook, all-MiniLM-L6-v2 (the ONNX export
// Xenova/all-MiniLM-L6-v2), with mean pooling and L2 normalisation, so inner product
// equals cosine similarity, exactly like faiss.IndexFlatIP after faiss.normalize_L2.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { recursiveChunk } from "./chunk.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = path.join(ROOT, "data", "docs");
const OUT_DIR = path.join(ROOT, "public", "index");
const CHUNKS_FILE = path.join(OUT_DIR, "chunks.json");
const VECTORS_FILE = path.join(OUT_DIR, "embeddings.bin");

export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const MODEL_DTYPE = "q8"; // the browser loads the same quantised weights
const CHUNK_SIZE = 300;
const CHUNK_OVERLAP = 50;
const DIM = 384;

function docTitle(text, file) {
  const lines = text.split("\n").map((l) => l.trim());
  const title = [];
  let kind = "";
  for (const line of lines) {
    if (!line || line === "---") break;
    if (/^(Week|Day) \d/.test(line)) {
      kind = line;
      break;
    }
    if (line.startsWith("Collection:")) {
      kind = line.slice("Collection:".length).trim();
      break;
    }
    title.push(line);
  }
  return { title: title.join(" ") || file.replace(/\.txt$/, ""), kind };
}

async function main() {
  const files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith(".txt")).sort();
  if (files.length === 0) throw new Error(`No .txt files found in ${DOCS_DIR}`);

  const docs = [];
  const chunks = [];
  const hash = crypto.createHash("sha256").update(`${MODEL_ID}|${MODEL_DTYPE}|${CHUNK_SIZE}|${CHUNK_OVERLAP}`);
  for (const file of files) {
    const text = fs.readFileSync(path.join(DOCS_DIR, file), "utf8");
    hash.update(file).update(text);
    const pieces = recursiveChunk(text, CHUNK_SIZE, CHUNK_OVERLAP);
    const { title, kind } = docTitle(text, file);
    docs.push({ file, title, kind, chars: text.length, chunks: pieces.length, firstChunk: chunks.length });
    for (const t of pieces) chunks.push({ t, s: docs.length - 1 });
  }
  const corpusHash = hash.digest("hex").slice(0, 16);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Skip embedding if nothing changed.
  if (fs.existsSync(CHUNKS_FILE) && fs.existsSync(VECTORS_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(CHUNKS_FILE, "utf8"));
      if (prev.meta?.hash === corpusHash && prev.meta?.embeddings) {
        console.log(`[index] corpus unchanged (${chunks.length} chunks), keeping existing embeddings`);
        return;
      }
    } catch {}
  }

  const lengths = chunks.map((c) => c.t.length);
  const meta = {
    hash: corpusHash,
    model: MODEL_ID,
    dtype: MODEL_DTYPE,
    dim: DIM,
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
    totalChars: docs.reduce((a, d) => a + d.chars, 0),
    avgChunk: +(lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(1),
    maxChunk: Math.max(...lengths),
    minChunk: Math.min(...lengths),
    embeddings: false,
    builtAt: new Date().toISOString(),
  };

  console.log(`[index] ${docs.length} documents -> ${chunks.length} chunks`);

  try {
    const { pipeline } = await import("@huggingface/transformers");
    console.log(`[index] loading ${MODEL_ID} (${MODEL_DTYPE})...`);
    const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: MODEL_DTYPE });
    const vectors = new Float32Array(chunks.length * DIM);
    const BATCH = 32;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH).map((c) => c.t);
      const out = await extractor(batch, { pooling: "mean", normalize: true });
      vectors.set(out.data, i * DIM);
      process.stdout.write(`\r[index] embedded ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
    }
    process.stdout.write("\n");
    fs.writeFileSync(VECTORS_FILE, Buffer.from(vectors.buffer));
    meta.embeddings = true;
    console.log(`[index] wrote ${path.relative(ROOT, VECTORS_FILE)} (${(vectors.byteLength / 1e6).toFixed(1)} MB)`);
  } catch (err) {
    // No internet, or the model could not load. The site still works with keyword search.
    console.warn(`\n[index] WARNING: could not compute embeddings: ${err?.message ?? err}`);
    console.warn("[index] The site will fall back to keyword (TF-IDF) search only.");
    if (fs.existsSync(VECTORS_FILE)) fs.rmSync(VECTORS_FILE);
  }

  fs.writeFileSync(CHUNKS_FILE, JSON.stringify({ meta, docs, chunks }));
  console.log(`[index] wrote ${path.relative(ROOT, CHUNKS_FILE)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
