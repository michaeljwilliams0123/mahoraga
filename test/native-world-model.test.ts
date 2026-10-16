import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { trainNativeWorldModel, loadNativeWorldCheckpoint, predictNativeWorldState } from "../src/native-world-model.ts";
import type { NativeWorldEpisode, NativeWorldTrainingInput } from "../src/native-world-model.ts";
import * as worldModel from "../src/native-world-model.ts";

const digest = "a".repeat(64);
function episode(episodeId: string, actionId: string, value: number, change: number): NativeWorldEpisode {
  return { episodeId, actionId, state: { load: value }, nextState: { load: value + change },
    rights: "owner-authorized", rightsEvidenceDigest: digest };
}
function input(): NativeWorldTrainingInput {
  return {
    modelId: "mahoraga-learned-world-test", trainingCodeSha: "b".repeat(40),
    seed: 42, epochs: 150, learningRate: 0.05, features: ["load"], actions: ["increase","decrease"],
    training: [
      episode("train-i-one", "increase", -.4, .2),
      episode("train-i-two", "increase", -.2, .2),
      episode("train-i-three", "increase", .2, .2),
      episode("train-i-four", "increase", .4, .2),
      episode("train-d-one", "decrease", -.3, -.25),
      episode("train-d-two", "decrease", -.1, -.25),
      episode("train-d-three", "decrease", .3, -.25),
      episode("train-d-four", "decrease", .5, -.25),
    ],
    evaluation: [
      episode("hold-i-one", "increase", -.1, .2),
      episode("hold-i-two", "increase", .3, .2),
      episode("hold-d-one", "decrease", -.2, -.25),
      episode("hold-d-two", "decrease", .4, -.25),
    ],
  };
}
test("offline trainable dynamics actually updates weights and generalizes to unseen states", () => {
  const result = trainNativeWorldModel(input());
  assert.equal(result.checkpoint.manifest.parameterCount, 4);
  assert.equal(result.checkpoint.manifest.architecture, "action-conditioned-linear-residual-v1");
  assert.equal(result.checkpoint.manifest.creditCost, 0);
  assert.equal(result.checkpoint.manifest.productionActivated, false);
  assert.equal(result.checkpoint.manifest.executionAuthorityGranted, false);
  assert.equal(result.checkpoint.manifest.qualification, "offline-heldout-only");
  assert.equal(result.metrics.improved, true);
  assert.ok(result.metrics.trainingAfter < result.metrics.trainingBefore * .1);
  assert.ok(result.metrics.heldoutAfter < result.metrics.heldoutBefore * .1);
  assert.ok(Math.abs(predictNativeWorldState(result.checkpoint, "increase", { load: .1 }).predictedState.load! - .3) < .04);
  assert.ok(Math.abs(predictNativeWorldState(result.checkpoint, "decrease", { load: .1 }).predictedState.load! + .15) < .04);
});
test("fixed-seed checkpoint and predictions reproduce bit-for-bit after save/load", () => {
  const a = trainNativeWorldModel(input()), b = trainNativeWorldModel(input());
  assert.deepEqual(a, b);
  const revived = loadNativeWorldCheckpoint(JSON.stringify(a.checkpoint));
  assert.deepEqual(revived, a.checkpoint);
  assert.deepEqual(predictNativeWorldState(revived, "increase", {load: .6}),
    predictNativeWorldState(a.checkpoint, "increase", {load: .6}));
  assert.equal(Object.isFrozen(revived), true);
  assert.equal(Object.isFrozen(revived.weights), true);
  assert.throws(() => predictNativeWorldState(revived, "run-shell", {load: .1}), /action-not-trained/);
  assert.throws(() => predictNativeWorldState(revived, "increase", {unknown: .1}), /state-invalid/);
});
test("training rights, budgets, actions, dimensions and heldout contamination fail closed", () => {
  const original = input();
  for (const patch of [
    { seed: 0 }, { epochs: 251 }, { learningRate: Infinity }, { learningRate: 0.2 },
    { features: ["load","unknown"] }, { actions: ["increase","decrease","execute"] },
    { training: [{ ...original.training[0]!, rights: "external-unknown" }] },
    { evaluation: [original.training[0]!, ...original.evaluation] },
    { evaluation: [{ ...original.evaluation[0]!, episodeId: "train-i-one" }, ...original.evaluation.slice(1)] },
    { evaluation: original.evaluation.filter(x => x.actionId === "increase") },
    { evaluation: [{ ...original.evaluation[0]!, rightsEvidenceDigest: "no-evidence" }, ...original.evaluation.slice(1)] },
    { training: [{ ...original.training[0]!, nextState: { load: NaN } }, ...original.training.slice(1)] },
  ]) {
    assert.throws(() => trainNativeWorldModel({ ...original, ...patch } as NativeWorldTrainingInput));
  }
});
test("checkpoint integrity and authority escalation are rejected even with a recomputed fingerprint", () => {
  const checkpoint = trainNativeWorldModel(input()).checkpoint;
  const tampered = JSON.parse(JSON.stringify(checkpoint));
  tampered.weights[0] += .125;
  assert.throws(() => loadNativeWorldCheckpoint(JSON.stringify(tampered)), /checkpoint-integrity/);
  const escalated = JSON.parse(JSON.stringify(checkpoint));
  escalated.manifest.productionActivated = true;
  const { fingerprint: _unused, ...core } = escalated;
  escalated.fingerprint = createHash("sha256").update(JSON.stringify(core)).digest("hex");
  assert.throws(() => loadNativeWorldCheckpoint(JSON.stringify(escalated)), /checkpoint-invalid/);
  assert.throws(() => loadNativeWorldCheckpoint("{malformed"));
  assert.throws(() => loadNativeWorldCheckpoint(JSON.stringify({ ...checkpoint, injected: "provider-token" })));
});
test("run is a candidate model only: no production effect or native-world capability is granted", () => {
  const candidate = trainNativeWorldModel(input());
  const proposed = predictNativeWorldState(candidate.checkpoint, "increase", {load: .25});
  assert.equal(proposed.kind, "native-world-offline-prediction");
  assert.equal(proposed.executionAuthorityGranted, false);
  assert.ok(Math.abs(proposed.predictedState.load! - .45) < .04);
  assert.notEqual(candidate.checkpoint.fingerprint, digest);
});
test("changed outcome labels cannot disguise a reused training intervention as heldout", () => {
  const original = input();
  const reused = { ...original.training[0]!, episodeId: "changed-label", nextState: { load: .9 } };
  assert.throws(() => trainNativeWorldModel({ ...original, evaluation: [reused, ...original.evaluation] }), /data-leakage/);
});
test("third-split assessment measures learned transitions against persistence without updating the checkpoint", () => {
  assert.equal(typeof worldModel.assessNativeWorldHoldout, "function");
  const original = input(), checkpoint = trainNativeWorldModel(original).checkpoint;
  const before = JSON.stringify(checkpoint);
  const holdout = [episode("final-i", "increase", .7, .2), episode("final-d", "decrease", -.7, -.25)];
  const result = worldModel.assessNativeWorldHoldout(checkpoint, { training: original.training, evaluation: original.evaluation, holdout });
  assert.ok(result.meanSquaredError < .001);
  assert.ok(Math.abs(result.persistenceMeanSquaredError - .05125) < 1e-12);
  assert.ok(result.meanSquaredError < result.persistenceMeanSquaredError * .1);
  assert.equal(result.holdoutExamples, 2);
  assert.equal(result.checkpointFingerprint, checkpoint.fingerprint);
  assert.match(result.holdoutDataDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.perAction.map(x => [x.actionId, x.examples]), [["decrease", 1], ["increase", 1]]);
  assert.equal(result.executionAuthorityGranted, false);
  assert.equal(Object.isFrozen(result.perAction), true);
  assert.equal(JSON.stringify(checkpoint), before);
  assert.deepEqual(result, worldModel.assessNativeWorldHoldout(loadNativeWorldCheckpoint(before), {
    training: original.training, evaluation: original.evaluation, holdout,
  }));
});
test("third-split assessment binds reference data and rejects reused interventions, ids and missing actions", () => {
  assert.equal(typeof worldModel.assessNativeWorldHoldout, "function");
  const original = input(), checkpoint = trainNativeWorldModel(original).checkpoint;
  const holdout = [episode("final-i", "increase", .7, .2), episode("final-d", "decrease", -.7, -.25)];
  const assess = (patch: object) => worldModel.assessNativeWorldHoldout(checkpoint, {
    training: original.training, evaluation: original.evaluation, holdout, ...patch,
  });
  assert.throws(() => assess({ training: original.training.slice(1) }), /reference-data-mismatch/);
  assert.throws(() => assess({ evaluation: original.evaluation.slice(1) }), /reference-data-mismatch/);
  for (const reused of [original.training[0]!, original.evaluation[0]!]) {
    assert.throws(() => assess({ holdout: [{ ...reused, episodeId: "fresh-id", nextState: { load: .95 } }, ...holdout] }), /data-leakage/);
    assert.throws(() => assess({ holdout: [{ ...holdout[0]!, episodeId: reused.episodeId }, holdout[1]!] }), /data-leakage/);
  }
  assert.throws(() => assess({ holdout: [holdout[0]!] }), /action-holdout-incomplete/);
  assert.throws(() => assess({ holdout: [holdout[0]!, { ...holdout[0]!, episodeId: "duplicate-intervention" }, holdout[1]!] }), /data-leakage/);
  assert.throws(() => assess({ holdout: [{ ...holdout[0]!, rightsEvidenceDigest: "unproven" }, holdout[1]!] }), /episode-invalid/);
});
