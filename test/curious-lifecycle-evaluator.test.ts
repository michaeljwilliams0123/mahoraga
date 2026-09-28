import assert from "node:assert/strict";
import test from "node:test";
import {
  compareReconstruction,
  evaluateAbsorption,
  evaluateAgenticScenario,
  evaluateCrossModeScenario,
  evaluateGenerativeScenario,
  evaluatePredictiveScenario,
} from "../src/curious-lifecycle-evaluator.ts";
import { AGENTIC_FIXTURE, CROSS_MODE_FIXTURE, GENERATIVE_FIXTURE, PREDICTIVE_FIXTURE } from "../evaluation/curious-lifecycle-fixtures.ts";

test("generative evaluation rejects unsupported claims with literal score evidence", () => {
  const accepted = evaluateGenerativeScenario(GENERATIVE_FIXTURE);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.score, 1);
  const rejected = evaluateGenerativeScenario({ ...GENERATIVE_FIXTURE, claims: [...GENERATIVE_FIXTURE.claims, { text: "A third route executed.", evidenceRefs: [] }] });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.score, 0.5);
  assert.deepEqual(rejected.reasons, ["unsupported-claim"]);
});

test("predictive evaluation requires bound numeric transition and simulation status", () => {
  assert.equal(evaluatePredictiveScenario(PREDICTIVE_FIXTURE).score, 1);
  const wrong = evaluatePredictiveScenario({ ...PREDICTIVE_FIXTURE, predictedState: { queueDepth: 3 } });
  assert.equal(wrong.accepted, false);
  assert.deepEqual(wrong.reasons, ["prediction-transition-mismatch"]);
  assert.deepEqual(evaluatePredictiveScenario({ ...PREDICTIVE_FIXTURE, simulationOnly: false }).reasons, ["prediction-execution-conflated"]);
});

test("agentic evaluation preserves material dissent and separates plan from execution", () => {
  assert.equal(evaluateAgenticScenario(AGENTIC_FIXTURE).accepted, true);
  assert.deepEqual(evaluateAgenticScenario({ ...AGENTIC_FIXTURE, preservedDissent: [] }).reasons, ["material-dissent-lost"]);
  assert.deepEqual(evaluateAgenticScenario({ ...AGENTIC_FIXTURE, executed: true }).reasons, ["plan-execution-conflated"]);
});

test("cross-mode evaluation preserves original evidence while revising conclusion", () => {
  const accepted = evaluateCrossModeScenario(CROSS_MODE_FIXTURE);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.score, 1);
  const rejected = evaluateCrossModeScenario({ ...CROSS_MODE_FIXTURE, revisedEvidenceRefs: ["evidence:research"] });
  assert.deepEqual(rejected.reasons, ["original-evidence-not-preserved"]);
});

const validComparison = {
  runId: "abc123def456",
  sourceSha: "b71510fbecc23cb7c89d0276a37f6e44a1730f23",
  baseline: { invariants: 0.9, provenance: 0.9, researchTransfer: 0.5, counterevidenceUse: 0.5 },
  candidate: { invariants: 0.9, provenance: 0.95, researchTransfer: 0.8, counterevidenceUse: 0.75 },
  baselineAuthority: ["self.inspect", "research.inspect"],
  candidateAuthority: ["self.inspect", "research.inspect"],
  provenanceComplete: true,
  quarantinedEvidenceCount: 0,
  independentVerification: true,
} as const;

test("reconstruction comparison rejects authority, provenance, quarantine, and invariant regressions", () => {
  assert.equal(compareReconstruction(validComparison).decision, "graduation-ready");
  assert.deepEqual(compareReconstruction({ ...validComparison, candidateAuthority: [...validComparison.candidateAuthority, "memory.absorb"] }).reasons, ["authority-expanded"]);
  assert.deepEqual(compareReconstruction({ ...validComparison, provenanceComplete: false }).reasons, ["provenance-incomplete"]);
  assert.deepEqual(compareReconstruction({ ...validComparison, quarantinedEvidenceCount: 1 }).reasons, ["quarantined-evidence-present"]);
  assert.deepEqual(compareReconstruction({ ...validComparison, candidate: { ...validComparison.candidate, invariants: 0.89 } }).reasons, ["invariant-regression"]);
});

test("reconstruction comparison requires held-out gains and independent verification", () => {
  const noGain = compareReconstruction({ ...validComparison, candidate: { ...validComparison.baseline } });
  assert.equal(noGain.decision, "hold");
  assert.deepEqual(noGain.reasons, ["held-out-improvement-insufficient"]);
  const selfVerified = compareReconstruction({ ...validComparison, independentVerification: false });
  assert.equal(selfVerified.decision, "reject");
  assert.deepEqual(selfVerified.reasons, ["independent-verification-missing"]);
});

test("absorption requires graduation comparison and rollback description", () => {
  const comparison = compareReconstruction(validComparison);
  const ready = evaluateAbsorption({ comparison, lesson: "Bind route claims to observed capability evidence.", provenanceRefs: ["evidence:projection-trace"], rollbackDescription: "Remove the isolated lesson and rerun baseline probes." });
  assert.equal(ready.decision, "graduation-ready");
  assert.equal(ready.canonicalMemoryChanged, false);
  assert.equal(ready.zeroCredit, true);
  assert.equal(ready.providerRequired, false);
  assert.equal(ready.creditCost, 0);
  assert.equal(ready.paidFallback, false);
  assert.deepEqual(ready.beforeMetrics, validComparison.baseline);
  assert.deepEqual(ready.afterMetrics, validComparison.candidate);
  assert.equal(evaluateAbsorption({ comparison, lesson: "Bind evidence.", provenanceRefs: ["evidence:projection-trace"], rollbackDescription: "" }).decision, "reject");
});
