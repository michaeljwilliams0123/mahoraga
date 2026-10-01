import test from "node:test";
import assert from "node:assert/strict";
import { runCognitiveMitosis, evaluateCognitiveClones } from "../src/cognitive-mitosis.ts";
// @ts-expect-error Existing governed JavaScript contract.
import { createCognitiveIndividual } from "../src/cognitive-individual.mjs";
// @ts-expect-error Existing governed JavaScript contract.
import { executeCognitiveCapability } from "../src/cognitive-worker.mjs";
const now = "2026-10-01T12:00:00.000Z";
function fixture() {
  const member = createCognitiveIndividual({ individualId: "parent-agent", parentAgentId: "mahoraga-core", displayName: "Parent", archetype: "analyst", perspective: "Evidence first", communicationStyle: "evidence-first", traits: { curiosity: 0.7 }, epistemicPosture: { evidenceThreshold: 0.8, uncertaintyTolerance: 0.4, dissentDisposition: "surface-material-dissent" }, perspectiveTags: ["evidence"], privateEpisodicRefs: [] }, { observedAt: now });
  return { members: [member], requiredPerspectiveTags: ["evidence"], positions: [{ individualId: "parent-agent", conclusion: "repair", confidence: 0.8, evidenceRefs: ["ev:a"], assumptions: [], unknowns: [], dissentTags: [] }], metacognition: { evidenceCoverage: 0.9, calibratedConfidence: 0.8, knownUnknowns: [], materialConflictCount: 0, reversible: true }, observedState: { queueDepth: 3 }, stateUncertainty: 0.1, proposedAction: { actionId: "baseline", effects: { queueDepth: -1 }, uncertainty: 0.1 }, plannerSnapshot: { workers: [], activeLeases: [], repository: { verified: true }, taskCounts: {}, objectives: [], providers: [] } };
}
const candidates = [{ id: "alternate", action: { actionId: "alternate", effects: { queueDepth: -2 }, uncertainty: 0.1 } }];
test("real clone workers preserve parent state and return distinct cognitive lineage", async () => {
  const input = fixture(), before = structuredClone(input);
  const run = await runCognitiveMitosis({ cognitiveInput: input, candidates, now: Date.parse(now) });
  assert.deepEqual(input, before);
  assert.equal(run.clones.length, 1);
  assert.ok(run.clones[0]!.threadId > 0);
  assert.equal(run.clones[0]!.cycle.prediction.predictedState.queueDepth, 1);
  assert.equal(run.baseline.prediction.predictedState.queueDepth, 2);
  assert.equal(run.clones[0]!.lineage[0]!.parentIndividualId, "parent-agent");
  assert.notEqual(run.clones[0]!.lineage[0]!.childIndividualId, "parent-agent");
  assert.doesNotMatch(JSON.stringify(run), /privateEpisodicRefs|credentials|memoryMatrix/);
  assert.equal(run.cleanedUp, true);
});
test("clone learning uses measured prediction outcomes and exact incumbent verification", async () => {
  const run = await runCognitiveMitosis({ cognitiveInput: fixture(), candidates, now: Date.parse(now) });
  const clone = run.clones[0]!;
  const scored = evaluateCognitiveClones(run, { observedState: { queueDepth: 1 }, observedAt: "2026-10-01T12:01:00.000Z", verification: { verified: true, sourceFingerprint: clone.cycle.fingerprint, evidenceRefs: ["ev:measured"] } });
  assert.equal(scored.selectedCloneId, clone.cloneId);
  assert.equal(scored.learning.promotable, true);
  assert.equal(scored.candidates[0]!.outcome.observedAccuracy, 1);
  assert.throws(() => evaluateCognitiveClones(run, { observedState: { queueDepth: 1 }, observedAt: now, verification: { verified: true, sourceFingerprint: "0".repeat(64), evidenceRefs: ["ev:a"] } }), /clone-verification-mismatch/);
  const held = evaluateCognitiveClones(run, { observedState: { queueDepth: 1 }, observedAt: now });
  assert.equal(held.learning.promotable, false);
});
test("mitosis rejects scope expansion, duplicate identities and budget overflow", async () => {
  await assert.rejects(runCognitiveMitosis({ cognitiveInput: fixture(), candidates: [...candidates, ...candidates] }), /clone-candidates-invalid/);
  await assert.rejects(runCognitiveMitosis({ cognitiveInput: { ...fixture(), credentials: "forbidden" }, candidates }), /clone-input-fields-invalid/);
  await assert.rejects(runCognitiveMitosis({ cognitiveInput: { ...fixture(), plannerSnapshot: { ...fixture().plannerSnapshot, credentials: "nested-secret" } }, candidates }), /clone-sensitive-state-forbidden/);
  await assert.rejects(runCognitiveMitosis({ cognitiveInput: { ...fixture(), plannerSnapshot: { ...fixture().plannerSnapshot, shared: new SharedArrayBuffer(4) } }, candidates }), /clone-state-not-json/);
  await assert.rejects(runCognitiveMitosis({ cognitiveInput: fixture(), candidates, limits: { maximumClones: 0 } }), /clone-limits-invalid/);
});
test("cancellation and short deadlines settle only after child cleanup", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runCognitiveMitosis({ cognitiveInput: fixture(), candidates, signal: controller.signal }), /clone-cancelled/);
  const pending = new AbortController();
  const run = runCognitiveMitosis({ cognitiveInput: fixture(), candidates, signal: pending.signal });
  pending.abort();
  await assert.rejects(run, /clone-cancelled/);
  await assert.rejects(runCognitiveMitosis({ cognitiveInput: fixture(), candidates, limits: { timeoutMs: 1 } }), /clone-timeout/);
});
test("existing cognitive cycle exposes optional cloned experiments without changing ordinary calls", async () => {
  const normal = await executeCognitiveCapability("cognitive.cycle", { capabilityInput: { cognitiveInput: fixture() } });
  assert.equal(normal.cycle.kind, "cognitive-loop-receipt");
  const cloned = await executeCognitiveCapability("cognitive.cycle", { capabilityInput: { cognitiveInput: fixture(), mitosis: { candidates } } });
  assert.equal(cloned.mitosis.cleanedUp, true);
  assert.equal(cloned.mitosis.clones.length, 1);
});
