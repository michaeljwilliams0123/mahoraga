export type Embedding = Readonly<{ modelDigest: string; vector: readonly number[] }>;
export type SemanticHit = Readonly<{ reference: string; similarity: number }>;

export function normalizeEmbedding(vector: readonly number[], dimensions: number): readonly number[] {
  integer(dimensions, 1, 4096, "semantic-dimensions-invalid");
  if (!Array.isArray(vector) || vector.length !== dimensions || !vector.every(value => typeof value === "number" && Number.isFinite(value))) fail("semantic-vector-invalid");
  const scale = Math.max(...vector.map(Math.abs));
  if (scale === 0) fail("semantic-vector-invalid");
  const scaled = vector.map(value => value / scale);
  const length = Math.sqrt(scaled.reduce((sum, value) => sum + value * value, 0));
  return Object.freeze(scaled.map(value => value / length));
}

/** Reference-only, transient index; similarity is retrieval evidence, not truth or authority. */
export function createSemanticIndex({ modelDigest, dimensions, maximumEntries = 1024 }: { modelDigest: string; dimensions: number; maximumEntries?: number }) {
  if (!/^[a-f0-9]{64}$/.test(modelDigest)) fail("semantic-model-invalid");
  integer(dimensions, 1, 4096, "semantic-dimensions-invalid");
  integer(maximumEntries, 1, 4096, "semantic-capacity-invalid");
  const vectors = new Map<string, readonly number[]>();
  const normalize = (embedding: Embedding) => {
    if (embedding.modelDigest !== modelDigest) fail("semantic-model-mismatch");
    return normalizeEmbedding(embedding.vector, dimensions);
  };
  return Object.freeze({
    get size() { return vectors.size; },
    upsert(entry: Embedding & { reference: string }): void {
      reference(entry.reference);
      const vector = normalize(entry);
      if (!vectors.has(entry.reference) && vectors.size >= maximumEntries) fail("semantic-index-full");
      vectors.set(entry.reference, vector);
    },
    search(query: Embedding & { limit?: number; minimumSimilarity?: number }): readonly SemanticHit[] {
      const vector = normalize(query), limit = query.limit ?? 10, minimum = query.minimumSimilarity ?? -1;
      integer(limit, 1, 4096, "semantic-limit-invalid");
      if (!Number.isFinite(minimum) || minimum < -1 || minimum > 1) fail("semantic-threshold-invalid");
      return Object.freeze([...vectors].map(([ref, values]) => Object.freeze({ reference: ref, similarity: Math.max(-1, Math.min(1, values.reduce((sum, value, index) => sum + value * vector[index]!, 0))) }))
        .filter(hit => hit.similarity >= minimum).sort((a, b) => b.similarity - a.similarity || a.reference.localeCompare(b.reference)).slice(0, limit));
    },
    remove(ref: string): boolean { reference(ref); return vectors.delete(ref); },
    clear(): void { vectors.clear(); },
  });
}
function reference(value: string): void { if (typeof value !== "string" || !/^[a-z][a-z0-9-]*:[A-Za-z0-9._:-]{1,200}$/.test(value)) fail("semantic-reference-invalid"); }
function integer(value: number, min: number, max: number, code: string): void { if (!Number.isSafeInteger(value) || value < min || value > max) fail(code); }
function fail(code: string): never { throw new TypeError(code); }
