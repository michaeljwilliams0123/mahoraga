import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureMemorySchema, ingestExecutionMemory, pruneStaleMemories, searchMemoryIndex } from '../deploy/cloudflare-execution-runtime/memory-engine';

class FakeVectorIndex {
  vectors = new Map<string, number[]>();
  deleted: string[] = [];
  async upsert(records: Array<{ id: string; values: number[] }>) { for (const record of records) this.vectors.set(record.id, record.values); }
  async query(_vector: number[], options: { topK: number }) { return { matches: [...this.vectors.keys()].slice(0, options.topK).map((id, index) => ({ id, score: 1 - index / 10 })) }; }
  async deleteByIds(ids: string[]) { this.deleted.push(...ids); for (const id of ids) this.vectors.delete(id); }
}

describe('D1 and Vectorize memory boundary', () => {
  beforeEach(async () => { await ensureMemorySchema(env.MEMORY_DB); await env.MEMORY_DB.exec('DELETE FROM execution_memories'); });

  it('persists indexed receipt context and retrieves it through parameterized semantic lookback', async () => {
    const index = new FakeVectorIndex(); const memoryEnv = { MEMORY_DB: env.MEMORY_DB, MEMORY_INDEX: index };
    await ingestExecutionMemory(memoryEnv, { id: 'turn-1', fingerprint: 'a'.repeat(64), content: 'Provider renewal failed closed.', kind: 'lesson', utilityScore: 0.8, createdAt: 1_000 });
    const results = await searchMemoryIndex(memoryEnv, 'renewal failure', 5);
    expect(results).toEqual([{ id: 'turn-1', fingerprint: 'a'.repeat(64), content: 'Provider renewal failed closed.', kind: 'lesson', utilityScore: 0.8, createdAt: 1_000, score: 1 }]);
    await expect(ingestExecutionMemory(memoryEnv, { id: "turn'); DROP TABLE execution_memories;--", fingerprint: 'b'.repeat(64), content: 'unsafe', kind: 'lesson', utilityScore: 1, createdAt: 1_001 })).rejects.toThrow('memory-record-invalid');
    expect((await env.MEMORY_DB.prepare('SELECT COUNT(*) AS total FROM execution_memories').first<{ total: number }>())?.total).toBe(1);
  });

  it('keeps the relational evidence active until Vectorize deletion succeeds after the grace period', async () => {
    const index = new FakeVectorIndex(); const memoryEnv = { MEMORY_DB: env.MEMORY_DB, MEMORY_INDEX: index };
    const now = 2_000_000_000_000; const createdAt = now - 365 * 24 * 3_600_000;
    await ingestExecutionMemory(memoryEnv, { id: 'expired', fingerprint: 'c'.repeat(64), content: 'Zero utility obsolete prediction.', kind: 'counterfactual-transition', utilityScore: 0, createdAt });
    expect(await pruneStaleMemories(memoryEnv, { now })).toMatchObject({ markedCount: 1, prunedCount: 0 });
    await env.MEMORY_DB.prepare('UPDATE execution_memories SET prune_candidate_at = ? WHERE id = ?').bind(now - 24 * 3_600_000, 'expired').run();
    index.deleteByIds = async () => { throw new Error('vector-unavailable'); };
    await expect(pruneStaleMemories(memoryEnv, { now })).rejects.toThrow('vector-unavailable');
    expect((await env.MEMORY_DB.prepare('SELECT is_stale FROM execution_memories WHERE id = ?').bind('expired').first<{ is_stale: number }>())?.is_stale).toBe(0);
  });
});
