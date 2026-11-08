// Embeds the question in the browser with the same model the index was built with.
// Transformers.js is loaded from a CDN at runtime (not bundled), and the model weights
// (about 23 MB) download once as a public file (no account or token), then the browser caches them.

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

type Extractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<{ data: Float32Array }>;

let extractorPromise: Promise<Extractor> | null = null;

export type LoadProgress = { loaded: number; total: number } | null;

export function loadEmbedder(model: string, dtype: string, onProgress?: (p: LoadProgress) => void): Promise<Extractor> {
  if (extractorPromise) return extractorPromise;
  extractorPromise = (async () => {
    const mod = await import(/* webpackIgnore: true */ TRANSFORMERS_URL);
    const files = new Map<string, { loaded: number; total: number }>();
    const extractor = await mod.pipeline("feature-extraction", model, {
      dtype,
      progress_callback: (e: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (e.status === "progress" && e.file) {
          files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 });
          let loaded = 0;
          let total = 0;
          for (const f of files.values()) {
            loaded += f.loaded;
            total += f.total;
          }
          onProgress?.({ loaded, total });
        }
      },
    });
    onProgress?.(null);
    return extractor as Extractor;
  })();
  extractorPromise.catch(() => {
    extractorPromise = null; // allow a retry after a network failure
  });
  return extractorPromise;
}

export async function embedQuery(extractor: Extractor, text: string): Promise<Float32Array> {
  const out = await extractor([text], { pooling: "mean", normalize: true });
  return out.data;
}
