import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assessNativeWorldHoldout, loadNativeWorldCheckpoint, trainNativeWorldModel } from "../src/native-world-model.ts";
import type { NativeWorldEpisode } from "../src/native-world-model.ts";

/** Hand-authored synthetic research; holdout separation is not independent evaluation. */
export function runNativeWorldExperiment(trainingCodeSha: string) {
  if (!/^[a-f0-9]{40}$/.test(trainingCodeSha)) throw new Error("world-experiment-source-invalid");
  const rightsEvidenceDigest = createHash("sha256").update("Mahoraga original synthetic coupled affine and quadratic transitions v1").digest("hex");
  const policy = { maximumMeanSquaredError: .001, maximumPersistenceErrorRatio: .1 };
  const actions = ["advance", "reverse"];
  function episodes(task: "affine" | "nonlinear", split: string, coordinates: number[]): NativeWorldEpisode[] {
    return actions.flatMap(actionId => coordinates.flatMap((x, xi) => coordinates.map((y, yi) => {
      const sign = actionId === "advance" ? 1 : -1;
      const nextState = task === "nonlinear" ? { x: x + sign * .7 * x * x, y: y + sign * .6 * y * y }
        : actionId === "advance" ? { x: x + .15 + .2 * x - .15 * y, y: y - .1 + .25 * x + .1 * y }
        : { x: x - .2 - .1 * x + .3 * y, y: y + .12 - .2 * x + .15 * y };
      return { episodeId: `${task}-${split}-${actionId}-${xi}-${yi}`, actionId, state: { x, y }, nextState,
        rights: "owner-authorized", rightsEvidenceDigest };
    })));
  }
  const datasets = (task: "affine" | "nonlinear") => ({
    training: episodes(task, "training", [-.8, -.4, 0, .4, .8]),
    evaluation: episodes(task, "development", [-.6, -.2, .2, .6]),
    holdout: episodes(task, "holdout", [-.9, -.5, .1, .5, .9]),
  });
  const affineData = datasets("affine"), nonlinearData = datasets("nonlinear");
  function runTask(task: "affine" | "nonlinear", data: ReturnType<typeof datasets>, seed: number) {
    const { checkpoint, metrics } = trainNativeWorldModel({ modelId: `world-${task}-experiment`, trainingCodeSha,
      seed, epochs: 150, learningRate: .03, features: ["x", "y"], actions,
      training: data.training, evaluation: data.evaluation });
    const before = JSON.stringify(checkpoint);
    const assessment = assessNativeWorldHoldout(checkpoint, data);
    const restoredAssessment = assessNativeWorldHoldout(loadNativeWorldCheckpoint(before), data);
    const qualified = assessment.meanSquaredError <= policy.maximumMeanSquaredError && assessment.perAction.every(action =>
      action.meanSquaredError <= policy.maximumMeanSquaredError &&
      action.meanSquaredError < action.persistenceMeanSquaredError * policy.maximumPersistenceErrorRatio);
    return { parameterCount: checkpoint.manifest.parameterCount,
      checkpointUnchanged: JSON.stringify(checkpoint) === before,
      saveLoadEqual: JSON.stringify(assessment) === JSON.stringify(restoredAssessment),
      result: { status: qualified ? "qualified-offline-experiment" : "hold", metrics,
        trainingDataDigest: checkpoint.manifest.trainingDataDigest,
        developmentDataDigest: checkpoint.manifest.evaluationDataDigest, assessment } };
  }
  const runs = [7, 42, 1337].map(seed => {
    const affine = runTask("affine", affineData, seed), nonlinear = runTask("nonlinear", nonlinearData, seed);
    return { seed, parameterCount: affine.parameterCount,
      checkpointUnchanged: affine.checkpointUnchanged && nonlinear.checkpointUnchanged,
      saveLoadEqual: affine.saveLoadEqual && nonlinear.saveLoadEqual,
      affine: affine.result, nonlinearStress: nonlinear.result };
  });
  return { schemaVersion: 1,
    status: runs.every(run => run.affine.status === "qualified-offline-experiment" && run.checkpointUnchanged && run.saveLoadEqual)
      ? "offline-experiment-complete" : "experiment-failed",
    task: "synthetic-coupled-world-transitions-v1", sourceSha: trainingCodeSha,
    architectureVersion: "action-conditioned-linear-residual-v1", trainingExamples: affineData.training.length,
    developmentExamples: affineData.evaluation.length, holdoutExamples: affineData.holdout.length,
    policy, runs, creditCost: 0, providerInvocations: 0, independentEvaluator: false,
    productionActivated: false, executionAuthorityGranted: false,
    limitations: ["developer-authored synthetic transitions with known generating rules",
      "same-process third split; tasks and fixed configuration were chosen during development",
      "one-step prediction only; no uncertainty calibration, rollout, live experience or general intelligence qualification",
      "quadratic stress measures misspecification of the existing linear architecture; HOLD is retained",
      "no model promotion, serving route or action execution"] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    git(["ls-files", "--error-unmatch", "src/native-world-model.ts", "scripts/native-world-experiment.ts"]);
    if (git(["status", "--porcelain", "--untracked-files=no"])) throw new Error("world-experiment-clean-source-required");
    const result = runNativeWorldExperiment(git(["rev-parse", "HEAD"]));
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "offline-experiment-complete") process.exitCode = 1;
  } catch {
    console.error("world-experiment-source-or-assessment-unverified"); process.exitCode = 1;
  }
}
