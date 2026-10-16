import test from "node:test";
import assert from "node:assert/strict";

test("world experiment separates affine learning from nonlinear model misspecification across fixed seeds", async () => {
  const { runNativeWorldExperiment } = await import("../scripts/native-world-experiment.ts");
  const result = runNativeWorldExperiment("b".repeat(40));
  assert.equal(result.status, "offline-experiment-complete");
  assert.equal(result.sourceSha, "b".repeat(40));
  assert.equal(result.providerInvocations, 0);
  assert.equal(result.creditCost, 0);
  assert.equal(result.productionActivated, false);
  assert.equal(result.executionAuthorityGranted, false);
  assert.equal(result.independentEvaluator, false);
  assert.deepEqual(result.runs.map(run => run.seed), [7, 42, 1337]);
  for (const run of result.runs) {
    assert.equal(run.parameterCount, 12);
    assert.equal(run.affine.status, "qualified-offline-experiment");
    assert.equal(run.nonlinearStress.status, "hold");
    assert.equal(run.checkpointUnchanged, true);
    assert.equal(run.saveLoadEqual, true);
    assert.ok(run.affine.assessment.meanSquaredError < result.policy.maximumMeanSquaredError);
    for (const action of run.affine.assessment.perAction) {
      assert.ok(action.meanSquaredError < action.persistenceMeanSquaredError * result.policy.maximumPersistenceErrorRatio);
    }
    assert.ok(run.nonlinearStress.assessment.meanSquaredError > result.policy.maximumMeanSquaredError);
    assert.equal(run.affine.assessment.holdoutExamples, 50);
    assert.notEqual(run.affine.assessment.holdoutDataDigest, run.nonlinearStress.assessment.holdoutDataDigest);
  }
  assert.deepEqual(result, runNativeWorldExperiment("b".repeat(40)));
  assert.throws(() => runNativeWorldExperiment("unverified"), /source-invalid/);
});
