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

function decisionMetadata(overrides = {}) {
  return {
    schemaVersion: 1,
    outcome: "stable",
    contentRef: "vault:11111111-1111-4111-8111-111111111111",
    contentSha256: "a".repeat(64),
    contentBytes: 321,
    contentClassification: "local-only",
    contentKind: "uccp-decision-summary",
    ...overrides,
  };
}

function boundedMetrics(overrides = {}) {
  return {
    driftRisk: "STABLE",
    databaseHealth: "WAL_OK",
    workerCount: 1,
    taskCount: 1,
    ...overrides,
  };
}

test("UCCP state uses WAL and persists only vault metadata across reopen", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-uccp-state-"));
  const file = path.join(root, "uccp.sqlite");

  const { openUccpStateStore } = await loadStoreModule();
  const first = openUccpStateStore({ file, now: () => 1_000 });
  assert.equal(first.health().journalMode, "wal");
  assert.equal(first.health().integrity, "ok");

  const summary = decisionMetadata();
  const lease = first.recordLease({
    leaseId: "lease-1",
    correlationId: "corr-1",
    workerName: "repository",
    currentNode: "Synthesis",
    decisionSummary: summary,
    metrics: boundedMetrics(),
    leaseDurationMs: 60_000,
  });
  assert.equal(lease.leaseId, "lease-1");
  assert.deepEqual(lease.decisionSummary, summary);
  first.close();

  const reopened = openUccpStateStore({ file, now: () => 2_000 });
  closeThenRemove(t, root, [reopened]);
  assert.equal(reopened.latestLease().correlationId, "corr-1");
  assert.deepEqual(reopened.latestLease().decisionSummary, summary);
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
    decisionSummary: decisionMetadata({ outcome: "hold" }),
    leaseDurationMs: 1_000,
  });
  assert.equal(store.listActiveLeases().length, 1);
  now = 6_001;
  assert.equal(store.listActiveLeases().length, 0);
});

test("UCCP state rejects raw decision content and private reasoning fields", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-uccp-private-"));
  const file = path.join(root, "uccp.sqlite");
  const { openUccpStateStore } = await loadStoreModule();
  const store = openUccpStateStore({ file });
  closeThenRemove(t, root, [store]);

  for (const rawSummary of [
    { proposal: "Observe candidate state.", challenge: "Check evidence.", synthesis: "Wait." },
    { ...decisionMetadata(), proposal: "Raw content must not persist." },
  ]) {
    assert.throws(() => store.recordLease({
      correlationId: "corr-raw",
      workerName: "repository",
      currentNode: "Note",
      decisionSummary: rawSummary,
      leaseDurationMs: 60_000,
    }), /uccp-decision-summary-metadata-invalid/);
  }

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

test("UCCP state validates the bounded metadata and metric allowlists", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-uccp-metadata-"));
  const file = path.join(root, "uccp.sqlite");
  const { openUccpStateStore } = await loadStoreModule();
  const store = openUccpStateStore({ file });
  closeThenRemove(t, root, [store]);
  const base = { correlationId: "corr-bounded", workerName: "repository", currentNode: "Synthesis", leaseDurationMs: 60_000 };

  for (const invalidSummary of [
    decisionMetadata({ contentRef: "not-a-vault-reference" }),
    decisionMetadata({ contentSha256: "bad" }),
    decisionMetadata({ contentClassification: "personal" }),
    decisionMetadata({ contentKind: "other" }),
    decisionMetadata({ outcome: "unknown" }),
    decisionMetadata({ unexpected: true }),
  ]) {
    assert.throws(() => store.recordLease({ ...base, decisionSummary: invalidSummary }), /uccp-decision-summary-metadata-invalid/);
  }

  for (const invalidMetrics of [
    boundedMetrics({ driftRisk: "NOPE" }),
    boundedMetrics({ databaseHealth: "NOPE" }),
    boundedMetrics({ workerCount: -1 }),
    boundedMetrics({ unexpected: true }),
  ]) {
    assert.throws(() => store.recordLease({ ...base, decisionSummary: decisionMetadata(), metrics: invalidMetrics }), /uccp-metrics-invalid/);
  }
});
