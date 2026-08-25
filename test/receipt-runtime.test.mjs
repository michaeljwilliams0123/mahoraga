import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeDatabase } from "../src/database.mjs";
import { createCapabilityReceipt } from "../src/receipt-registry.mjs";

test("typed receipts persist atomically across worker families", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-receipts-"));
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { allowLegacyPlaintextWrites: true });
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });
  for (const [capability, workerId] of [["browser.observe", "browser"], ["desktop.inspect", "desktop"], ["m365.health", "microsoft365"], ["codex.health", "primary-codex-builder"]]) {
    const task = database.submitTask({ capability, dataClass: capability.startsWith("m365") ? "enterprise" : "synthetic", idempotencyKey: `receipt-${capability}`, allowedWorkerIds: [workerId], policyVersion: "legacy-internal" });
    database.claimNext({ workerId, capabilities: [capability], leaseMs: 30_000 });
    database.markVerifying(task.id, `${workerId}:test`);
    const receipt = createCapabilityReceipt(capability, { verified: true, summary: `${capability} verified.`, providerHealth: { availability: "ready" } }, { observedAt: "2026-08-25T12:00:00.000Z", durationMs: 10 });
    const completed = database.completeTaskWithReceipt(task.id, receipt);
    assert.equal(completed.status, "completed");
    assert.equal(database.listReceipts(task.id)[0].receipt.capability, capability);
  }
});

test("malformed receipts leave a running task available for safe failure", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-receipt-failure-"));
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { allowLegacyPlaintextWrites: true });
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });
  const task = database.submitTask({ capability: "system.health", dataClass: "synthetic", idempotencyKey: "receipt-malformed" });
  database.claimNext({ workerId: "local-core", capabilities: ["system.health"], leaseMs: 30_000 });
  database.markVerifying(task.id, "local-core:test");
  assert.throws(() => database.completeTaskWithReceipt(task.id, { capability: "system.health" }), /receipt/);
  assert.equal(database.getTask(task.id).status, "verifying");
  assert.equal(database.failTaskSafely(task.id, { errorCode: "receipt-invalid", resultSummary: "Worker completion rejected." }).status, "failed");
});
