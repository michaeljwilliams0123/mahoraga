import test from "node:test";
import assert from "node:assert/strict";

import { createTaskReceipt, validateTaskReceipt } from "../src/task-receipt.mjs";

const intent = {
  schemaVersion: 1, intentKind: "repository-inspect", capability: "repository.inspect",
  confidence: 1, requiredEvidenceIds: ["request.repository"], targetId: null,
  limitations: [], reasonCode: "repository-request",
};

test("creates a frozen content-free receipt with bounded route and zero budgets", () => {
  const receipt = createTaskReceipt({
    intent,
    route: { capability: "repository.inspect", workerId: "worker.repository", reason: "registered-capability" },
    state: "succeeded",
    providerDecision: { providerId: null },
    nextAction: "return-summary",
  });
  assert.deepEqual(receipt, {
    schemaVersion: 1, intentKind: "repository-inspect", capability: "repository.inspect", state: "succeeded",
    requiredEvidenceIds: ["request.repository"], workerId: "worker.repository", routeReason: "registered-capability",
    providerId: null, normalCreditBudget: 0, hostedComputeSpendCeilingUsd: 0, limitations: [], nextAction: "return-summary",
  });
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.requiredEvidenceIds), true);
  assert.equal(Object.hasOwn(receipt, "content"), false);
  assert.throws(() => receipt.requiredEvidenceIds.push("raw prompt"));
});

test("unsupported conversational work is represented as unsupported, never successful", () => {
  const receipt = createTaskReceipt({
    intent: { ...intent, intentKind: "unsupported", capability: null, reasonCode: "answer-provider-unavailable" },
    route: { capability: null, workerId: null, reason: "no-registered-capability" },
    state: "unsupported",
    providerDecision: { providerId: null },
    nextAction: "explain-limitation",
  });
  assert.equal(receipt.state, "unsupported");
  assert.throws(() => createTaskReceipt({
    intent: { ...intent, intentKind: "unsupported", capability: null }, route: { capability: null, workerId: null, reason: "x" },
    state: "succeeded", providerDecision: { providerId: null }, nextAction: "x",
  }));
});

test("rejects raw URL, arbitrary path, unknown state, capability, and nonzero budgets", () => {
  const base = createTaskReceipt({ intent, route: { capability: "repository.inspect", workerId: null, reason: "x" }, state: "accepted", providerDecision: { providerId: null }, nextAction: "wait" });
  for (const mutation of [
    { ...base, state: "unknown" }, { ...base, capability: "arbitrary.command" }, { ...base, nextAction: "C:\\secret\\run.exe" },
    { ...base, normalCreditBudget: 1 }, { ...base, hostedComputeSpendCeilingUsd: 2 }, { ...base, rawUrl: "https://example.com" },
  ]) assert.throws(() => validateTaskReceipt(mutation));
});

test("enforces intent and capability consistency and unsupported-state restrictions", () => {
  const base = createTaskReceipt({ intent, route: { capability: "repository.inspect", workerId: null, reason: "x" }, state: "accepted", providerDecision: { providerId: null }, nextAction: "wait" });
  assert.throws(() => validateTaskReceipt({ ...base, intentKind: "browser-targets", capability: "repository.inspect" }));
  for (const state of ["accepted", "running", "verifying", "partial", "succeeded"]) {
    assert.throws(() => validateTaskReceipt({ ...base, intentKind: "unsupported", capability: null, state }));
  }
  assert.doesNotThrow(() => validateTaskReceipt({ ...base, intentKind: "unsupported", capability: null, state: "waiting" }));
  assert.throws(() => validateTaskReceipt({ ...base, requiredEvidenceIds: ["made-up-evidence"] }));
  assert.throws(() => validateTaskReceipt({ ...base, limitations: ["made-up-limitation"] }));
});
test("permits only the four unsupported states and rejects all unsupported capabilities", () => {
  const base = createTaskReceipt({ intent, route: { capability: "repository.inspect", workerId: null, reason: "x" }, state: "accepted", providerDecision: { providerId: null }, nextAction: "wait" });
  for (const state of ["unsupported", "waiting", "blocked", "failed"]) assert.doesNotThrow(() => validateTaskReceipt({ ...base, intentKind: "unsupported", capability: null, state }));
  for (const state of ["accepted", "running", "verifying", "partial", "succeeded"]) assert.throws(() => validateTaskReceipt({ ...base, intentKind: "unsupported", capability: null, state }));
  assert.throws(() => validateTaskReceipt({ ...base, intentKind: "unsupported", capability: "provider.gap", state: "unsupported" }));
});

test("freezes receipt root, arrays, and nested contract-derived values", () => {
  const receipt = createTaskReceipt({ intent, route: { capability: "repository.inspect", workerId: "worker.repository", reason: "registered-capability" }, state: "succeeded", providerDecision: { providerId: "provider.local", metadata: { ignored: true } }, nextAction: "return-summary" });
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.requiredEvidenceIds), true);
  assert.equal(Object.isFrozen(receipt.limitations), true);
  assert.equal(Object.isFrozen(receipt.normalCreditBudget), true);
  assert.throws(() => { receipt.requiredEvidenceIds[0] = "mutated"; });
  assert.throws(() => { receipt.limitations.push("mutated"); });
  assert.throws(() => { receipt.normalCreditBudget = 4; });
});