import test from "node:test";
import assert from "node:assert/strict";
import { createSemanticIndex, normalizeEmbedding } from "../src/semantic-memory.ts";
// @ts-expect-error Existing governed JavaScript memory contract.
import { createInstitutionalMemoryRecord, queryInstitutionalMemory } from "../src/institutional-memory.mjs";

const modelDigest = "a".repeat(64);
test("semantic index ranks references with cosine similarity without retaining content", () => {
  const index = createSemanticIndex({ modelDigest, dimensions: 2, maximumEntries: 2 });
  index.upsert({ reference: "memory:one", modelDigest, vector: [1, 0] });
  index.upsert({ reference: "memory:two", modelDigest, vector: [0, 1] });
  assert.deepEqual(index.search({ modelDigest, vector: [2, 0], limit: 1 }), [{ reference: "memory:one", similarity: 1 }]);
  index.upsert({ reference: "memory:one", modelDigest, vector: [0, 2] });
  assert.equal(index.size, 2);
  assert.throws(() => index.upsert({ reference: "memory:three", modelDigest, vector: [1, 1] }), /semantic-index-full/);
  assert.equal(index.remove("memory:one"), true);
  assert.equal(index.size, 1);
});
test("semantic retrieval rejects mixed models, invalid dimensions and nonfinite vectors", () => {
  const index = createSemanticIndex({ modelDigest, dimensions: 2 });
  for (const vector of [[0, 0], [1], [NaN, 1], [Infinity, 0]]) assert.throws(() => index.search({ modelDigest, vector }), /semantic-vector-invalid/);
  assert.throws(() => index.search({ modelDigest: "b".repeat(64), vector: [1, 0] }), /semantic-model-mismatch/);
  assert.throws(() => index.search({ modelDigest, vector: [1, 0], limit: 0 }), /semantic-limit-invalid/);
  assert.throws(() => normalizeEmbedding([], 0), /semantic-dimensions-invalid/);
});

test("institutional semantic queries respect existing freshness and supersession filters", () => {
  const make = (statement: string, supersedes: string[] = []) => createInstitutionalMemoryRecord({ memoryClass: "strategy", subject: "retrieval", statement, provenance: "verified-outcome", confidence: 0.8, freshness: "current", objectiveIds: [], evidenceRefs: ["ev:a"], capability: "cognitive-cycle", supersedes }, { observedAt: "2026-10-01T12:00:00.000Z" });
  const old = make("Old strategy"), current = make("Verified replacement", [old.memoryId]);
  const index = createSemanticIndex({ modelDigest, dimensions: 2 });
  index.upsert({ reference: `memory:${old.memoryId}`, modelDigest, vector: [1, 0] });
  index.upsert({ reference: `memory:${current.memoryId}`, modelDigest, vector: [0.8, 0.2] });
  const records = queryInstitutionalMemory({ records: [old, current], semantic: { index, query: { modelDigest, vector: [1, 0] } } });
  assert.deepEqual(records.map((record: { memoryId: string }) => record.memoryId), [current.memoryId]);
  const empty = queryInstitutionalMemory({ records: [old, current], semantic: { index, query: { modelDigest, vector: [0, 1], minimumSimilarity: 0.9 } } });
  assert.deepEqual(empty, []);
});
