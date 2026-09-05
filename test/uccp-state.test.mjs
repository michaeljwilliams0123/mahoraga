import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const modulePath = new URL("../src/state/schema.mjs", import.meta.url);

async function loadStoreModule() {
  assert.equal(existsSync(modulePath), true, "src/state/schema.mjs must exist");
  return import(modulePath.href);
}

function closeThenRemove(t, root, stores) {
  t.after(() => {
    for (const store of stores) store?.close?.();
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
}

test("UCCP state uses WAL and persists bounded lease summaries across reopen", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-uccp-state-"));
  const file = path.join(root, "uccp.sqlite");

  const { openUccpStateStore } = await loadStoreModule();
  const first = openUccpStateStore({ file, now: () => 1_000 });
  assert.equal(first.health().journalMode, "wal");
  assert.equal(first.health().integrity, "ok");

  const lease = first.recordLease({
    leaseId: "lease-1",
    correlationId: "corr-1",
    workerName: "repository",
    currentNode: "Synthesis",
    decisionSummary: {
      proposal: "Observe candidate state.",
      challenge: "Require containment evidence before mutation.",
      synthesis: "Hold candidate changes until verification passes.",
    },
    metrics: { driftRisk: "STABLE" },
    leaseDurationMs: 60_000,
  });
  assert.equal(lease.leaseId, "lease-1");
  first.close();

  const reopened = openUccpStateStore({ file, now: () => 2_000 });
  closeThenRemove(t, root, [reopened]);
  assert.equal(reopened.latestLease().correlationId, "corr-1");
  assert.equal(reopened.listActiveLeases().length, 1);
});

test("UCCP state excludes expired leases", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-uccp-expiry-"));
  const file = path.join(root, "uccp.sqlite");
  let now = 5_000;
  const { openUccpStateStore } = await loadStoreModule();
  const store = openUccpStateStore({ file, now: () => now });
  closeThenRemove(t, root, [store]);
  store.recordLease({
    leaseId: "lease-expiring",
    correlationId: "corr-expiring",
    workerName: "repository",
    currentNode: "Verification",
    decisionSummary: { proposal: "Verify.", challenge: "Check evidence.", synthesis: "Wait." },
    leaseDurationMs: 1_000,
  });
  assert.equal(store.listActiveLeases().length, 1);
  now = 6_001;
  assert.equal(store.listActiveLeases().length, 0);
});

test("UCCP state rejects raw reasoning fields", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-uccp-private-"));
  const file = path.join(root, "uccp.sqlite");
  const { openUccpStateStore } = await loadStoreModule();
  const store = openUccpStateStore({ file });
  closeThenRemove(t, root, [store]);

  for (const forbidden of [
    { thought: "private" },
    { chainOfThought: "private" },
    { nested: { currentThoughtChain: "private" } },
    { rawReasoning: "private" },
  ]) {
    assert.throws(() => store.recordLease({
      correlationId: "corr-private",
      workerName: "repository",
      currentNode: "Note",
      decisionSummary: forbidden,
      leaseDurationMs: 60_000,
    }), /uccp-private-reasoning-field-forbidden/);
  }
});