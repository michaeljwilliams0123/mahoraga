import test from "node:test";
import assert from "node:assert/strict";
import { createCapabilityReceipt, receiptDigest, receiptFailure, validateCapabilityReceipt } from "../src/receipt-registry.mjs";

const NOW = "2026-08-25T12:00:00.000Z";

test("worker results become bounded typed receipts", () => {
  const receipt = createCapabilityReceipt("repository.inspect", {
    verified: true,
    summary: "Repository inspected.",
    providerReceipt: { baseCommit: "a".repeat(40), changedPaths: ["src/server.mjs"], validationState: "not-requested" },
  }, { observedAt: NOW, durationMs: 31 });
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.outcome, "succeeded");
  assert.equal(receipt.details.family, "repository");
  assert.match(receiptDigest(receipt), /^[a-f0-9]{64}$/);
});

test("Codex receipts require contained candidate evidence", () => {
  const providerReceipt = {
    executionMode: "candidate-worktree",
    cellId: `cell-${"b".repeat(20)}`,
    executionSessionId: "cdb-receipt-test",
    sandbox: "workspace-write",
    approvalPolicy: "never",
    networkAccess: false,
    ephemeral: true,
    baseCommit: "a".repeat(40),
    headCommit: "c".repeat(40),
    branch: "mahoraga/task-receipt-test-abcdef12",
    worktreeIdentitySha256: "d".repeat(64),
    allowedPaths: ["src"],
    changedPaths: ["src/server.mjs"],
    validationState: "passed",
    quarantineState: "clear",
    failureCode: null, threadId: null, outputSha256: null,
    usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningOutputTokens: 0 },
    finalResponseStored: false,
  };
  const receipt = createCapabilityReceipt("codex.execute", { verified: true, summary: "Candidate contained.", providerReceipt }, { observedAt: NOW });
  assert.equal(receipt.details.providerEvidence.validationState, "passed");
  assert.throws(() => createCapabilityReceipt("codex.execute", { verified: true, summary: "Unsafe.", providerReceipt: { ...providerReceipt, changedPaths: ["secrets.txt"] } }, { observedAt: NOW }), /codex-receipt-path-outside-allowlist/);
});

test("unknown envelope fields and content-bearing evidence fail closed", () => {
  const receipt = createCapabilityReceipt("browser.observe", { verified: true, summary: "Observed.", receiptMetadata: { consoleErrors: 0 } }, { observedAt: NOW });
  assert.throws(() => validateCapabilityReceipt("browser.observe", { ...receipt, prompt: "secret" }), /receipt-envelope-field-unknown/);
  assert.throws(() => createCapabilityReceipt("m365.open", { verified: true, summary: "Opened.", providerReceipt: { documentText: "secret" } }, { observedAt: NOW }), /receipt-evidence-key-forbidden/);
});

test("capability and family mismatches are rejected", () => {
  const receipt = createCapabilityReceipt("desktop.inspect", { verified: true, summary: "Inspected.", receiptMetadata: { interactive: true } }, { observedAt: NOW });
  assert.throws(() => validateCapabilityReceipt("m365.health", receipt), /receipt-envelope-invalid/);
  assert.throws(() => validateCapabilityReceipt("desktop.inspect", { ...receipt, details: { ...receipt.details, family: "browser" } }), /desktop-receipt-details-invalid/);
});

test("receipts require an explicit positive worker verification claim", () => {
  assert.throws(
    () => createCapabilityReceipt("repair.scan", { healthy: false, summary: "Repair scan found corruption." }, { observedAt: NOW }),
    /worker-verification-required/,
  );
  assert.equal(createCapabilityReceipt("repair.scan", { verified: false, healthy: false, summary: "Repair scan found corruption." }, { observedAt: NOW }).outcome, "failed");
});
test("receipt failures produce stable bounded error contracts", () => {
  assert.deepEqual(receiptFailure(Object.assign(new Error("bad"), { code: "receipt-summary-invalid" })), {
    errorCode: "receipt-summary-invalid",
    boundedSummary: "Worker completion rejected: receipt-summary-invalid.",
  });
});
