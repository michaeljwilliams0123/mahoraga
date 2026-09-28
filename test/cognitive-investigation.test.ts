import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  completeInvestigation,
  createInvestigation,
  recordInvestigationStep,
  validateInvestigationReceipt,
  type InvestigationState,
} from "../src/cognitive-investigation.ts";

const SHA = "b71510fbecc23cb7c89d0276a37f6e44a1730f23";

function start(behaviorImplicated = true): InvestigationState {
  return createInvestigation({
    runId: "abc123def456",
    sourceSha: SHA,
    trigger: "baseline-capability-gap",
    behaviorImplicated,
    budgets: { questions: 8, evidence: 12, capabilityInvocations: 8 },
  });
}

function ready(): InvestigationState {
  let state = start();
  state = recordInvestigationStep(state, { kind: "question", id: "q-manifest", text: "Why did the manifest omit the expected route?", target: "manifest-route-gap" });
  state = recordInvestigationStep(state, { kind: "hypothesis", id: "h-self", statement: "My capability projection dropped the route.", confidence: 0.55, selfFault: true });
  state = recordInvestigationStep(state, { kind: "hypothesis", id: "h-evidence", statement: "The supplied manifest evidence is incomplete.", confidence: 0.45, selfFault: false });
  state = recordInvestigationStep(state, { kind: "predicted-evidence", hypothesisId: "h-self", supports: ["evidence:projection-trace"], weakens: ["evidence:complete-manifest"] });
  state = recordInvestigationStep(state, { kind: "predicted-evidence", hypothesisId: "h-evidence", supports: ["evidence:complete-manifest"], weakens: ["evidence:projection-trace"] });
  state = recordInvestigationStep(state, { kind: "observation", evidenceRef: "evidence:projection-trace", supports: ["h-self"], weakens: ["h-evidence"] });
  state = recordInvestigationStep(state, { kind: "counterevidence", evidenceRef: "evidence:complete-manifest", hypothesisId: "h-self" });
  state = recordInvestigationStep(state, { kind: "confidence-update", hypothesisId: "h-self", before: 0.55, after: 0.7, evidenceRefs: ["evidence:projection-trace", "evidence:complete-manifest"], reasonCode: "projection-defect-supported" });
  state = recordInvestigationStep(state, { kind: "model-delta", priorFingerprint: "a".repeat(64), revisedFingerprint: "b".repeat(64) });
  return state;
}

const completion = {
  selectedConclusion: "The bounded projection omitted a supported route.",
  rejectedAlternatives: ["The manifest evidence was incomplete."],
  unknowns: ["Whether another held-out route is affected."],
  stopReason: "evidence-sufficient" as const,
};

test("investigation requires two hypotheses including self-fault when behavior is implicated", () => {
  let state = start();
  state = recordInvestigationStep(state, { kind: "question", id: "q-route", text: "Why is the route absent?", target: "route-gap" });
  state = recordInvestigationStep(state, { kind: "hypothesis", id: "h-source", statement: "The source evidence is incomplete.", confidence: 0.8, selfFault: false });
  state = recordInvestigationStep(state, { kind: "hypothesis", id: "h-runtime", statement: "The observed runtime evidence is stale.", confidence: 0.2, selfFault: false });
  assert.throws(() => completeInvestigation(state, completion), /investigation-self-fault-hypothesis-required/);
});

test("investigation requires predicted support and weakening evidence", () => {
  let state = start();
  state = recordInvestigationStep(state, { kind: "question", id: "q-route", text: "Why is the route absent?", target: "route-gap" });
  state = recordInvestigationStep(state, { kind: "hypothesis", id: "h-self", statement: "My projection failed.", confidence: 0.5, selfFault: true });
  state = recordInvestigationStep(state, { kind: "hypothesis", id: "h-source", statement: "The source omitted evidence.", confidence: 0.5, selfFault: false });
  assert.throws(() => completeInvestigation(state, completion), /investigation-predicted-evidence-required/);
});

test("investigation cannot complete before counterevidence is inspected", () => {
  let state = ready();
  state = { ...state, counterevidence: [] };
  assert.throws(() => completeInvestigation(state, completion), /investigation-counterevidence-required/);
});

test("equivalent questions consume budget but do not satisfy novelty", () => {
  let state = start(false);
  state = recordInvestigationStep(state, { kind: "question", id: "q-one", text: "Why is the route absent?", target: "route-gap" });
  assert.throws(
    () => recordInvestigationStep(state, { kind: "question", id: "q-two", text: "Could the missing route be absent?", target: "route-gap" }),
    /investigation-question-repeated/,
  );
  assert.equal(state.budgetUsed.questions, 1);
});

test("budget exhaustion completes as hold without an invented conclusion", () => {
  let state = createInvestigation({ runId: "abc123def456", sourceSha: SHA, trigger: "gap", behaviorImplicated: false, budgets: { questions: 1, evidence: 1, capabilityInvocations: 1 } });
  state = recordInvestigationStep(state, { kind: "question", id: "q-one", text: "What evidence is missing?", target: "missing-evidence" });
  const receipt = completeInvestigation(state, { selectedConclusion: null, rejectedAlternatives: [], unknowns: ["Root cause remains unknown."], stopReason: "budget-exhausted" });
  assert.equal(receipt.decision, "hold");
  assert.equal(receipt.selectedConclusion, null);
});

test("capability proposal is evidence only and never an active route", () => {
  let state = ready();
  state = recordInvestigationStep(state, {
    kind: "capability-invocation",
    capability: "self.propose-capability",
    inputFingerprint: "c".repeat(64),
    authorityDecision: "routable",
    evidenceRefs: ["evidence:projection-trace"],
    resultFingerprint: "d".repeat(64),
    reasonCode: "missing-held-out-inspector",
  });
  const receipt = completeInvestigation(state, { ...completion, nextCapabilityProposal: { capability: "held-out.inspect", permissionClass: "read", evidenceNeeded: ["evidence:independent-need"] } });
  assert.equal(receipt.nextCapabilityProposal?.active, false);
  assert.equal((receipt as unknown as { routes?: unknown }).routes, undefined);
});

test("receipt rejects raw-thought and unknown fields", () => {
  const receipt = completeInvestigation(ready(), completion);
  assert.throws(() => validateInvestigationReceipt({ ...receipt, rawThought: "hidden trace" }), /investigation-receipt-invalid/);
  assert.throws(() => validateInvestigationReceipt({ ...receipt, scratchpad: [] }), /investigation-receipt-invalid/);
});

test("receipt rejects tampering and preserves predecessor fingerprints", () => {
  const receipt = completeInvestigation(ready(), completion);
  assert.match(receipt.predecessorFingerprint, /^[a-f0-9]{64}$/);
  assert.match(receipt.fingerprint, /^[a-f0-9]{64}$/);
  assert.throws(() => validateInvestigationReceipt({ ...receipt, selectedConclusion: "Fabricated replacement." }), /investigation-fingerprint-invalid/);
  assert.deepEqual(validateInvestigationReceipt(receipt), receipt);
  assert.equal(Object.isFrozen(receipt), true);
});

test("evidence-sufficient completion requires the full question, observation, revision, and uncertainty trail", () => {
  const cases = [
    { questions: [] },
    { observations: [] },
    { confidenceUpdates: [] },
    { modelDelta: null },
  ];
  for (const missing of cases) {
    assert.throws(() => completeInvestigation({ ...ready(), ...missing }, completion), /investigation-(question|observation|confidence-update|model-delta)-required/);
  }
  assert.throws(() => completeInvestigation(ready(), { ...completion, unknowns: [] }), /investigation-unknowns-required/);
});

test("confidence revisions must refer to inspected evidence and start at the recorded confidence", () => {
  const state = ready();
  assert.throws(() => recordInvestigationStep(state, { kind: "confidence-update", hypothesisId: "h-evidence", before: 0.45, after: 0.3, evidenceRefs: ["evidence:invented"], reasonCode: "new-evidence" }), /investigation-confidence-evidence-unobserved/);
  assert.throws(() => recordInvestigationStep(state, { kind: "confidence-update", hypothesisId: "h-evidence", before: 0.8, after: 0.3, evidenceRefs: ["evidence:complete-manifest"], reasonCode: "new-evidence" }), /investigation-confidence-before-mismatch/);
});

test("a rehashed receipt with an incomplete curiosity trail is rejected at the controller boundary", () => {
  const receipt = completeInvestigation(ready(), completion);
  for (const patch of [{ observations: [] }, { counterevidence: [] }, { confidenceUpdates: [] }, { modelDelta: null }, { decision: "hold" }]) {
    const { fingerprint: _fingerprint, ...core } = { ...receipt, ...patch };
    const rehashed = { ...core, fingerprint: createHash("sha256").update(JSON.stringify(core)).digest("hex") };
    assert.throws(() => validateInvestigationReceipt(rehashed), /investigation-receipt-invalid/);
  }
});

test("a rehashed confidence change cannot cite evidence absent from the investigation", () => {
  const receipt = completeInvestigation(ready(), completion);
  const { fingerprint: _fingerprint, ...core } = {
    ...receipt,
    confidenceUpdates: [{ ...receipt.confidenceUpdates[0]!, evidenceRefs: ["evidence:invented"] }],
  };
  const rehashed = { ...core, fingerprint: createHash("sha256").update(JSON.stringify(core)).digest("hex") };
  assert.throws(() => validateInvestigationReceipt(rehashed), /investigation-receipt-invalid/);
});
