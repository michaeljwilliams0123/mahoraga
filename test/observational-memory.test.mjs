import test from "node:test";
import assert from "node:assert/strict";
import { buildMemoryWindow } from "../src/observational-memory.mjs";

test("memory keeps only recent raw turns while preserving exact authority and evidence", () => {
  const immutableEvidence = [
    { type: "approval", id: "approval-1", sha256: "a".repeat(64), state: "approved" },
    { type: "receipt", id: "receipt-1", sha256: "b".repeat(64), state: "verified" },
  ];
  const memory = buildMemoryWindow({
    recentTurns: [
      { id: "turn-1", role: "user", content: "old private turn", createdAt: "2026-08-31T00:00:00.000Z" },
      { id: "turn-2", role: "assistant", content: "recent answer", createdAt: "2026-08-31T00:01:00.000Z" },
      { id: "turn-3", role: "user", content: "current request", createdAt: "2026-08-31T00:02:00.000Z" },
    ],
    observations: [{ id: "obs-1", summarySha256: "c".repeat(64), sizeBytes: 240, createdAt: "2026-08-31T00:01:30.000Z" }],
    immutableEvidence,
    limits: { rawTurnLimit: 2, observationLimit: 10, maximumBytes: 4096 },
  });
  assert.deepEqual(memory.recentTurns.map((item) => item.id), ["turn-2", "turn-3"]);
  assert.doesNotMatch(JSON.stringify(memory), /old private turn/);
  assert.deepEqual(memory.immutableEvidence, immutableEvidence);
});

test("observations cannot smuggle raw summaries or replace exact evidence", () => {
  assert.throws(() => buildMemoryWindow({ recentTurns: [], observations: [{ id: "obs-1", rawSummary: "private" }], immutableEvidence: [], limits: { rawTurnLimit: 2, observationLimit: 10, maximumBytes: 4096 } }), /observation-invalid/);
  assert.throws(() => buildMemoryWindow({ recentTurns: [], observations: [], immutableEvidence: [{ type: "summary", id: "x", sha256: "d".repeat(64), state: "approved" }], limits: { rawTurnLimit: 2, observationLimit: 10, maximumBytes: 4096 } }), /immutable-evidence-type-invalid/);
});
