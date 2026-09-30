import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openEvolutionPatchStore } from "../src/state/schema.mjs";

test("evolution patch store uses WAL and keeps one active verified patch", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mahoraga-evolution-"));
  const store = openEvolutionPatchStore({ file: path.join(directory, "runtime.db"), now: () => 1000 });
  try {
    const first = store.recordPatch({
      patchSha: "a".repeat(40),
      predecessorSha: "b".repeat(40),
      targetBranch: "feature/first",
      componentTarget: "src/router.mjs",
      lineChanges: 12,
      verificationStatus: "VERIFIED_PASS",
      deployedAt: 900,
      isActive: true,
    });
    assert.equal(first.liveCpuUsageMs, null);
    store.recordPatch({
      patchSha: "c".repeat(40),
      predecessorSha: "a".repeat(40),
      targetBranch: "feature/second",
      componentTarget: "deploy/cloudflare-execution-runtime/worker.ts",
      lineChanges: 20,
      verificationStatus: "VERIFIED_PASS",
      liveCpuUsageMs: 4.2,
      liveMemoryUsageMb: 11,
      deployedAt: 950,
      isActive: true,
    });
    assert.equal(store.health().journalMode, "wal");
    assert.equal(store.health().integrity, "ok");
    assert.equal(store.activePatch().patchSha, "c".repeat(40));
    assert.equal(store.listRecent().filter((entry) => entry.isActive).length, 1);
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("evolution patch store fails closed on invalid metrics and lifecycle state", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mahoraga-evolution-"));
  const store = openEvolutionPatchStore({ file: path.join(directory, "runtime.db") });
  try {
    const base = {
      patchSha: "d".repeat(40),
      predecessorSha: "e".repeat(40),
      targetBranch: "feature/test",
      componentTarget: "src/router.mjs",
      lineChanges: 1,
      verificationStatus: "VERIFIED_PASS",
    };
    assert.throws(() => store.recordPatch({ ...base, liveCpuUsageMs: -1 }), /evolution-telemetry-invalid/);
    assert.throws(() => store.recordPatch({ ...base, verificationStatus: "UNBOUNDED" }), /evolution-status-invalid/);
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
