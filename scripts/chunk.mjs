// A faithful JavaScript port of `recursive_chunk` from the Week 8 Day 2 notebook.
// Same separators, same size and overlap rules, so the site sees the same chunks.

export function recursiveChunk(text, chunkSize = 300, chunkOverlap = 50) {
  const separators = ["\n\n", "\n", ". ", " "];

  function split(t, seps) {
    if (t.length <= chunkSize) return [t];
    if (seps.length === 0) {
      const step = chunkSize - chunkOverlap;
      const out = [];
      for (let i = 0; i < t.length; i += step) out.push(t.slice(i, i + chunkSize));
      return out;
    }
    const sep = seps[0];
    const parts = t.split(sep);
    // keep the separator attached to each piece, except the last one
    const pieces = parts.map((p, i) => (i < parts.length - 1 ? p + sep : p));
    const chunks = [];
    let current = "";
    for (const piece of pieces) {
      if (current.length + piece.length <= chunkSize) {
        current += piece;
      } else {
        if (current) chunks.push(current);
        if (piece.length > chunkSize) {
          chunks.push(...split(piece, seps.slice(1)));
          current = "";
        } else {
          current = piece;
        }
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  const chunks = split(text, separators).filter((c) => c.trim());
  // overlap: each chunk carries the first chunkOverlap characters of the next one
  return chunks.map((c, i) => (i < chunks.length - 1 ? c + chunks[i + 1].slice(0, chunkOverlap) : c));
}
