const EMBEDDING_DIMENSIONS = 384;
const DECAY_COEFFICIENT_PER_HOUR = 0.0001;
const HOUR_MS = 3_600_000;
export const MEMORY_PRUNE_GRACE_MS = 24 * HOUR_MS;

export type MemoryKind = "counterfactual-transition" | "cognitive-cycle" | "lesson";
export type MemoryRecord = Readonly<{
  id: string;
  fingerprint: string;
  content: string;
  kind: MemoryKind;
  utilityScore: number;
  createdAt: number;
}>;
export type MemoryPruneCandidate = Readonly<{ id: string; utilityScore: number; createdAt: number; pruneCandidateAt: number | null }>;
export type MemoryPrunePlan = Readonly<{ markCandidateIds: string[]; deleteIds: string[]; clearCandidateIds: string[] }>;

type D1StatementLike = { bind: (...values: unknown[]) => D1StatementLike; run: () => Promise<unknown>; all: <T>() => Promise<{ results?: T[] }> };
type D1Like = { exec: (query: string) => Promise<unknown>; prepare: (query: string) => D1StatementLike };
type VectorMatch = { id: string; score?: number };
type VectorIndexLike = {
  upsert: (vectors: Array<{ id: string; values: number[]; metadata: Record<string, string | number> }>) => Promise<unknown>;
  query: (vector: number[], options: { topK: number; returnMetadata: boolean }) => Promise<{ matches: VectorMatch[] }>;
  deleteByIds: (ids: string[]) => Promise<unknown>;
};
export type MemoryEnvironment = Readonly<{ MEMORY_DB: D1Like; MEMORY_INDEX: VectorIndexLike }>;

const validId = (value: string): boolean => /^[A-Za-z0-9:_-]{1,128}$/.test(value);
const validFingerprint = (value: string): boolean => /^[a-f0-9]{64}$/.test(value);
const validKind = (value: string): value is MemoryKind => value === "counterfactual-transition" || value === "cognitive-cycle" || value === "lesson";

export function deterministicMemoryEmbedding(content: string): number[] {
  if (typeof content !== "string" || !content.trim() || new TextEncoder().encode(content).byteLength > 32_000) throw new TypeError("memory-content-invalid");
  const vector = Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = content.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
  for (const token of tokens) {
    let hash = 2166136261;
    for (const char of token) { hash ^= char.codePointAt(0)!; hash = Math.imul(hash, 16777619) >>> 0; }
    const index = hash % EMBEDDING_DIMENSIONS;
    const sign = (hash & 0x80000000) === 0 ? 1 : -1;
    vector[index] = vector[index]! + sign * (1 + Math.min(token.length, 32) / 32);
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) throw new TypeError("memory-content-invalid");
  return vector.map((value) => value / magnitude);
}

export function memoryDecayScore(memory: Pick<MemoryPruneCandidate, "utilityScore" | "createdAt">, now = Date.now()): number {
  if (!Number.isFinite(memory.utilityScore) || memory.utilityScore < 0 || memory.utilityScore > 1) throw new RangeError("memory-utility-invalid");
  if (!Number.isSafeInteger(memory.createdAt) || memory.createdAt < 0 || !Number.isSafeInteger(now) || now < memory.createdAt) throw new RangeError("memory-created-at-invalid");
  return memory.utilityScore * Math.exp(-DECAY_COEFFICIENT_PER_HOUR * ((now - memory.createdAt) / HOUR_MS));
}

export function planMemoryPruning(memories: readonly MemoryPruneCandidate[], options: { now?: number; minRetentionScore?: number; graceMs?: number } = {}): MemoryPrunePlan {
  const now = options.now ?? Date.now(); const threshold = options.minRetentionScore ?? 0.15; const graceMs = options.graceMs ?? MEMORY_PRUNE_GRACE_MS;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1 || !Number.isSafeInteger(graceMs) || graceMs < HOUR_MS) throw new RangeError("memory-prune-policy-invalid");
  const markCandidateIds: string[] = []; const deleteIds: string[] = []; const clearCandidateIds: string[] = [];
  for (const memory of memories) {
    if (!validId(memory.id) || (memory.pruneCandidateAt !== null && (!Number.isSafeInteger(memory.pruneCandidateAt) || memory.pruneCandidateAt < 0))) throw new TypeError("memory-prune-record-invalid");
    const belowThreshold = memoryDecayScore(memory, now) < threshold;
    if (!belowThreshold) { if (memory.pruneCandidateAt !== null) clearCandidateIds.push(memory.id); continue; }
    if (memory.pruneCandidateAt === null) markCandidateIds.push(memory.id);
    else if (memory.pruneCandidateAt <= now - graceMs) deleteIds.push(memory.id);
  }
  return { markCandidateIds, deleteIds, clearCandidateIds };
}

export async function ensureMemorySchema(db: D1Like): Promise<void> {
  await db.exec("CREATE TABLE IF NOT EXISTS execution_memories (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, content TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('counterfactual-transition','cognitive-cycle','lesson')), utility_score REAL NOT NULL CHECK(utility_score >= 0 AND utility_score <= 1), created_at INTEGER NOT NULL, is_stale INTEGER NOT NULL DEFAULT 0 CHECK(is_stale IN (0,1)), vector_state TEXT NOT NULL DEFAULT 'pending' CHECK(vector_state IN ('pending','indexed')), prune_candidate_at INTEGER, pruned_at INTEGER)");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_execution_memories_active ON execution_memories(is_stale, created_at)");
}

export async function ingestExecutionMemory(env: MemoryEnvironment, record: MemoryRecord): Promise<void> {
  if (!validId(record.id) || !validFingerprint(record.fingerprint) || !validKind(record.kind) || !Number.isSafeInteger(record.createdAt) || record.createdAt < 0) throw new TypeError("memory-record-invalid");
  memoryDecayScore(record, record.createdAt); const embedding = deterministicMemoryEmbedding(record.content);
  await ensureMemorySchema(env.MEMORY_DB);
  await env.MEMORY_DB.prepare(`INSERT INTO execution_memories (id,fingerprint,content,kind,utility_score,created_at,is_stale,vector_state)
    VALUES (?,?,?,?,?,?,0,'pending') ON CONFLICT(id) DO UPDATE SET fingerprint=excluded.fingerprint,content=excluded.content,kind=excluded.kind,
    utility_score=excluded.utility_score,created_at=excluded.created_at,is_stale=0,vector_state='pending',prune_candidate_at=NULL,pruned_at=NULL`)
    .bind(record.id, record.fingerprint, record.content, record.kind, record.utilityScore, record.createdAt).run();
  await env.MEMORY_INDEX.upsert([{ id: record.id, values: embedding, metadata: { kind: record.kind, createdAt: record.createdAt, fingerprint: record.fingerprint } }]);
  await env.MEMORY_DB.prepare("UPDATE execution_memories SET vector_state = 'indexed' WHERE id = ? AND fingerprint = ?").bind(record.id, record.fingerprint).run();
}

export async function searchMemoryIndex(env: MemoryEnvironment, query: string, topK = 5): Promise<Array<MemoryRecord & { score: number | null }>> {
  if (!Number.isSafeInteger(topK) || topK < 1 || topK > 20) throw new RangeError("memory-search-limit-invalid");
  await ensureMemorySchema(env.MEMORY_DB);
  const matches = (await env.MEMORY_INDEX.query(deterministicMemoryEmbedding(query), { topK, returnMetadata: false })).matches.filter((match) => validId(match.id));
  if (matches.length === 0) return [];
  const byId = new Map(matches.map((match) => [match.id, Number.isFinite(match.score) ? match.score! : null]));
  const placeholders = matches.map(() => "?").join(",");
  const rows = (await env.MEMORY_DB.prepare(`SELECT id,fingerprint,content,kind,utility_score AS utilityScore,created_at AS createdAt FROM execution_memories WHERE id IN (${placeholders}) AND is_stale = 0 AND vector_state = 'indexed'`).bind(...matches.map((match) => match.id)).all<MemoryRecord>()).results ?? [];
  return rows.map((row) => ({ ...row, score: byId.get(row.id) ?? null })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

export async function pruneStaleMemories(env: MemoryEnvironment, options: { now?: number; minRetentionScore?: number; graceMs?: number } = {}): Promise<{ markedCount: number; prunedCount: number; deletedIds: string[] }> {
  await ensureMemorySchema(env.MEMORY_DB); const now = options.now ?? Date.now();
  const rows = (await env.MEMORY_DB.prepare("SELECT id,utility_score AS utilityScore,created_at AS createdAt,prune_candidate_at AS pruneCandidateAt FROM execution_memories WHERE is_stale = 0 ORDER BY created_at LIMIT 500").all<MemoryPruneCandidate>()).results ?? [];
  const plan = planMemoryPruning(rows, { ...options, now });
  for (const id of plan.markCandidateIds) await env.MEMORY_DB.prepare("UPDATE execution_memories SET prune_candidate_at = ? WHERE id = ? AND prune_candidate_at IS NULL AND is_stale = 0").bind(now, id).run();
  for (const id of plan.clearCandidateIds) await env.MEMORY_DB.prepare("UPDATE execution_memories SET prune_candidate_at = NULL WHERE id = ? AND is_stale = 0").bind(id).run();
  if (plan.deleteIds.length > 0) {
    await env.MEMORY_INDEX.deleteByIds(plan.deleteIds);
    const placeholders = plan.deleteIds.map(() => "?").join(",");
    await env.MEMORY_DB.prepare(`UPDATE execution_memories SET is_stale = 1, pruned_at = ? WHERE id IN (${placeholders}) AND is_stale = 0`).bind(now, ...plan.deleteIds).run();
  }
  return { markedCount: plan.markCandidateIds.length, prunedCount: plan.deleteIds.length, deletedIds: plan.deleteIds };
}
