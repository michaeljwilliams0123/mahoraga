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

test("conversation completion preserves the detailed answer while the receipt stays bounded", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-answer-receipt-"));
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { allowLegacyPlaintextWrites: true });
  t.after(() => { database.close(); rmSync(root, { recursive: true, force: true }); });
  const conversation = database.createConversation({ title: "Rain", initialMessage: "Why does it rain?" });
  const task = database.submitTask({
    capability: "assistant.respond", dataClass: "local-only", idempotencyKey: "receipt-detailed-answer",
    requestedOutcome: "Why does it rain?", conversationId: conversation.id, allowedWorkerIds: ["question-model"],
  });
  database.claimNext({ workerId: "question-model", capabilities: ["assistant.respond"], leaseMs: 30_000 });
  database.markVerifying(task.id, "question-model:test");
  const answer = "Rain falls when condensed cloud droplets or ice crystals become heavy enough that gravity overcomes the air currents holding them up.";
  const receipt = createCapabilityReceipt("assistant.respond", { verified: true, summary: "A detailed explanation of rain was produced." });

  database.completeTaskWithReceipt(task.id, receipt, { conversationContent: answer });

  const messages = database.listConversationMessages(conversation.id);
  assert.equal(messages.at(-1).role, "assistant");
  assert.equal(messages.at(-1).content, answer);
  assert.equal(database.getTask(task.id).resultSummary, receipt.summary);
});
