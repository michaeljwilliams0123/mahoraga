import assert from "node:assert/strict";
import test from "node:test";
import { completeInvestigation } from "../src/cognitive-investigation.ts";
import {
  advanceLifecycle,
  createLifecycleRun,
  finalizeLifecycle,
  markLifecycleFailure,
  validateLifecycleReceipt,
  workerNameFor,
  type LifecycleRun,
} from "../src/curious-lifecycle.ts";
import { createInvestigation, recordInvestigationStep } from "../src/cognitive-investigation.ts";

const SHA = "b71510fbecc23cb7c89d0276a37f6e44a1730f23";
const RUN_ID = "abc123def456";
const OBSERVED_AT = "2026-09-28T18:00:00.000Z";
const EXPIRES_AT = "2026-09-28T18:15:00.000Z";
const FINGERPRINT = "a".repeat(64);

function investigationReceipt() {
  let state = createInvestigation({ runId: RUN_ID, sourceSha: SHA, trigger: "baseline-gap", behaviorImplicated: false, budgets: { questions: 1, evidence: 1, capabilityInvocations: 1 } });
  state = recordInvestigationStep(state, { kind: "question", id: "q-gap", text: "What remains unknown?", target: "unknown-gap" });
  return completeInvestigation(state, { selectedConclusion: null, rejectedAlternatives: [], unknowns: ["Cause remains uncertain."], stopReason: "budget-exhausted" });
}

function throughCloneRetirement(): LifecycleRun {
  let run = createLifecycleRun({ runId: RUN_ID, sourceSha: SHA, requestedAt: OBSERVED_AT });
  run = advanceLifecycle(run, { to: "clone-deployed", runId: RUN_ID, sourceSha: SHA, observedAt: OBSERVED_AT, worker: { role: "clone", deploymentId: "deployment-clone-1", expiresAt: EXPIRES_AT } });
  run = advanceLifecycle(run, { to: "baseline-proven", runId: RUN_ID, sourceSha: SHA, observedAt: OBSERVED_AT, evaluationFingerprint: FINGERPRINT });
  run = advanceLifecycle(run, { to: "clone-retired", runId: RUN_ID, sourceSha: SHA, observedAt: OBSERVED_AT, workerRole: "clone", retirementFingerprint: "b".repeat(64), inventoryAbsent: true });
  return run;
}

function throughReconstructionRetirement(): LifecycleRun {
  let run = throughCloneRetirement();
  run = advanceLifecycle(run, { to: "researching", runId: RUN_ID, sourceSha: SHA, observedAt: OBSERVED_AT });
  run = advanceLifecycle(run, { to: "research-complete", runId: RUN_ID, sourceSha: SHA, observedAt: OBSERVED_AT, investigation: investigationReceipt() });
  run = advanceLifecycle(run, { to: "reconstruction-deployed", runId: RUN_ID, sourceSha: SHA, observedAt: OBSERVED_AT, worker: { role: "reconstruction", deploymentId: "deployment-reconstruction-1", expiresAt: EXPIRES_AT } });
  run = advanceLifecycle(run, { to: "reconstruction-proven", runId: RUN_ID, sourceSha: SHA, observedAt: OBSERVED_AT, evaluationFingerprint: "c".repeat(64) });
  run = advanceLifecycle(run, { to: "absorption-evaluated", runId: RUN_ID, sourceSha: SHA, observedAt: OBSERVED_AT, comparisonFingerprint: "d".repeat(64), absorptionFingerprint: "e".repeat(64) });
  run = advanceLifecycle(run, { to: "reconstruction-retired", runId: RUN_ID, sourceSha: SHA, observedAt: OBSERVED_AT, workerRole: "reconstruction", retirementFingerprint: "f".repeat(64), inventoryAbsent: true });
  return run;
}

test("lifecycle accepts only the complete ordered transition sequence", () => {
  const run = throughReconstructionRetirement();
  const receipt = finalizeLifecycle(run, { observedAt: OBSERVED_AT, absentWorkerNames: [workerNameFor(RUN_ID, "clone"), workerNameFor(RUN_ID, "reconstruction")] });
  assert.equal(receipt.state, "complete");
  assert.equal(receipt.cleanupStatus, "complete");
  assert.equal(receipt.workers.length, 2);
  assert.equal(receipt.transitions.length, 10);
  assert.deepEqual(validateLifecycleReceipt(receipt), receipt);
});

test("lifecycle rejects out-of-order and replayed transitions", () => {
  const run = createLifecycleRun({ runId: RUN_ID, sourceSha: SHA, requestedAt: OBSERVED_AT });
  assert.throws(() => advanceLifecycle(run, { to: "researching", runId: RUN_ID, sourceSha: SHA, observedAt: OBSERVED_AT }), /lifecycle-transition-out-of-order/);
  const deployed = advanceLifecycle(run, { to: "clone-deployed", runId: RUN_ID, sourceSha: SHA, observedAt: OBSERVED_AT, worker: { role: "clone", deploymentId: "deployment-clone-1", expiresAt: EXPIRES_AT } });
  assert.throws(() => advanceLifecycle(deployed, { to: "clone-deployed", runId: RUN_ID, sourceSha: SHA, observedAt: OBSERVED_AT, worker: { role: "clone", deploymentId: "deployment-clone-1", expiresAt: EXPIRES_AT } }), /lifecycle-transition-out-of-order/);
});

test("lifecycle binds every transition to the run id and source sha", () => {
  const run = createLifecycleRun({ runId: RUN_ID, sourceSha: SHA, requestedAt: OBSERVED_AT });
  const transition = { to: "clone-deployed" as const, runId: "fff123def456", sourceSha: SHA, observedAt: OBSERVED_AT, worker: { role: "clone" as const, deploymentId: "deployment-clone-1", expiresAt: EXPIRES_AT } };
  assert.throws(() => advanceLifecycle(run, transition), /lifecycle-run-binding-invalid/);
  assert.throws(() => advanceLifecycle(run, { ...transition, runId: RUN_ID, sourceSha: "0".repeat(40) }), /lifecycle-source-binding-invalid/);
});

test("lifecycle rejects expired deployment evidence", () => {
  const run = createLifecycleRun({ runId: RUN_ID, sourceSha: SHA, requestedAt: OBSERVED_AT });
  assert.throws(() => advanceLifecycle(run, { to: "clone-deployed", runId: RUN_ID, sourceSha: SHA, observedAt: OBSERVED_AT, worker: { role: "clone", deploymentId: "deployment-clone-1", expiresAt: "2026-09-28T17:59:59.000Z" } }), /lifecycle-worker-expired/);
});

test("lifecycle rejects predecessor tampering", () => {
  const run = createLifecycleRun({ runId: RUN_ID, sourceSha: SHA, requestedAt: OBSERVED_AT });
  const tampered = { ...run, predecessorFingerprint: "1".repeat(64) };
  assert.throws(() => advanceLifecycle(tampered, { to: "clone-deployed", runId: RUN_ID, sourceSha: SHA, observedAt: OBSERVED_AT, worker: { role: "clone", deploymentId: "deployment-clone-1", expiresAt: EXPIRES_AT } }), /lifecycle-fingerprint-invalid/);
});

test("lifecycle derives two worker identities and refuses a third", () => {
  const run = throughReconstructionRetirement();
  assert.deepEqual(run.workers.map((worker) => worker.name), [workerNameFor(RUN_ID, "clone"), workerNameFor(RUN_ID, "reconstruction")]);
  assert.throws(() => advanceLifecycle(run, { to: "clone-deployed", runId: RUN_ID, sourceSha: SHA, observedAt: OBSERVED_AT, worker: { role: "clone", deploymentId: "deployment-clone-2", expiresAt: EXPIRES_AT } }), /lifecycle-transition-out-of-order/);
});

test("lifecycle cannot complete before both inventory absence proofs", () => {
  const run = throughReconstructionRetirement();
  assert.throws(() => finalizeLifecycle(run, { observedAt: OBSERVED_AT, absentWorkerNames: [workerNameFor(RUN_ID, "clone")] }), /lifecycle-cleanup-incomplete/);
});

test("failed lifecycle remains cleanup-required while an orphan exists", () => {
  let run = createLifecycleRun({ runId: RUN_ID, sourceSha: SHA, requestedAt: OBSERVED_AT });
  run = advanceLifecycle(run, { to: "clone-deployed", runId: RUN_ID, sourceSha: SHA, observedAt: OBSERVED_AT, worker: { role: "clone", deploymentId: "deployment-clone-1", expiresAt: EXPIRES_AT } });
  const failed = markLifecycleFailure(run, { observedAt: OBSERVED_AT, reasonCode: "probe-failed", orphanWorkerNames: [workerNameFor(RUN_ID, "clone")] });
  assert.equal(failed.state, "cleanup-required");
  assert.deepEqual(failed.orphanWorkerNames, [workerNameFor(RUN_ID, "clone")]);
  assert.throws(() => finalizeLifecycle(failed, { observedAt: OBSERVED_AT, absentWorkerNames: [] }), /lifecycle-cleanup-incomplete/);
});
