import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAnswerQuality, unresolvedAnswerSummary } from "../src/answer-quality.mjs";

const task = Object.freeze({
  capability: "assistant.respond",
  requestedOutcome: "Explain why the private Mahoraga interface returned not found and give the concrete fix.",
  completionCriteria: "substantive-response",
});

test("substantive, responsive, verified answers pass deterministic quality checks", () => {
  const evaluation = evaluateAnswerQuality({
    task,
    result: {
      verified: true,
      summary: "The private interface returned not found because the running server had snapshotted an older route set. Restart the staged runtime after verification so the corrected route table is loaded.",
      completionEvidence: { criteriaSatisfied: true, evidenceCount: 2, unresolved: false },
    },
  });
  assert.equal(evaluation.accepted, true);
  assert.deepEqual(evaluation.reasons, []);
  assert.match(evaluation.evidence.summarySha256, /^[a-f0-9]{64}$/);
  assert.equal(evaluation.evidence.providerVerified, true);
});

test("mere acknowledgements and vague responses do not count as completion", () => {
  const acknowledgement = evaluateAnswerQuality({
    task,
    result: { verified: true, summary: "I saved this assignment in the durable conversation and will keep the context available while you are away." },
  });
  assert.equal(acknowledgement.accepted, false);
  assert.ok(acknowledgement.reasons.includes("mere-acknowledgement"));

  const vague = evaluateAnswerQuality({ task, result: { verified: true, summary: "not-found" } });
  assert.equal(vague.accepted, false);
  assert.ok(vague.reasons.includes("vague-response"));
  assert.ok(vague.reasons.includes("contradictory-answer"));
});

test("nonresponsive, unverified, and provider-declared unresolved answers fail closed", () => {
  const evaluation = evaluateAnswerQuality({
    task,
    result: {
      verified: false,
      summary: "The weather forecast contains several temperatures and a chance of rain tomorrow afternoon.",
      completionEvidence: { criteriaSatisfied: false, evidenceCount: 0, unresolved: true },
    },
  });
  assert.equal(evaluation.accepted, false);
  assert.ok(evaluation.reasons.includes("provider-verification-failed"));
  assert.ok(evaluation.reasons.includes("nonresponsive-response"));
  assert.ok(evaluation.reasons.includes("completion-criteria-unsatisfied"));
  assert.ok(evaluation.reasons.includes("provider-declared-unresolved"));
});

test("worker-verified deterministic results do not require artificial lexical overlap", () => {
  const evaluation = evaluateAnswerQuality({
    task: { capability: "system.health", requestedOutcome: "Verify local runtime", completionCriteria: "worker-verified" },
    result: { verified: true, summary: "Mahoraga 3.6.0 local supervisor is responsive with four fresh worker heartbeats." },
  });
  assert.equal(evaluation.accepted, true);
});

test("exhausted quality failures produce explicit uncertainty instead of fabricated completion", () => {
  const evaluation = evaluateAnswerQuality({ task, result: { verified: true, summary: "Done." } });
  const summary = unresolvedAnswerSummary(evaluation, 3);
  assert.match(summary, /could not verify a complete response after 3 bounded attempts/i);
  assert.match(summary, /No claim of completion was recorded/);
  assert.doesNotMatch(summary, /successfully completed/i);
});

test("completion evidence rejects extra content-bearing fields", () => {
  assert.throws(() => evaluateAnswerQuality({
    task,
    result: { verified: true, summary: "A detailed response.", completionEvidence: { criteriaSatisfied: true, evidenceCount: 1, unresolved: false, modelOutput: "private" } },
  }), /completion-evidence-field-invalid/);
});
