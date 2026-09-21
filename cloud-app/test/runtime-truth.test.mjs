import test from "node:test";
import assert from "node:assert/strict";
import { deriveRuntimeTruth } from "../lib/runtime-truth.ts";

const sourceSha = "source-sha";

test("source newer than deployment cannot claim cognition readiness", () => {
  const truth = deriveRuntimeTruth({ sourceSha, deploymentSha: "old-sha", deploymentStatus: "SUCCESS", live: true, ready: true });
  assert.equal(truth.status, "source-ahead");
  assert.equal(truth.cognitionReady, false);
});

test("failed deployment fails closed even if endpoints appear reachable", () => {
  const truth = deriveRuntimeTruth({ sourceSha, deploymentSha: sourceSha, deploymentStatus: "FAILED", live: true, ready: true });
  assert.equal(truth.status, "deployment-failed");
  assert.equal(truth.cognitionReady, false);
});

test("skipped deployment is not deployed cognition", () => {
  const truth = deriveRuntimeTruth({ sourceSha, deploymentSha: sourceSha, deploymentStatus: "SKIPPED", live: true, ready: true });
  assert.equal(truth.status, "deployment-skipped");
  assert.equal(truth.cognitionReady, false);
});

test("exact SHA without live evidence fails closed", () => {
  const truth = deriveRuntimeTruth({ sourceSha, deploymentSha: sourceSha, deploymentStatus: "SUCCESS", live: false, ready: false });
  assert.equal(truth.status, "live-unreachable");
  assert.equal(truth.cognitionReady, false);
});

test("exact successful deployment requires both live and ready evidence", () => {
  const truth = deriveRuntimeTruth({ sourceSha, deploymentSha: sourceSha, deploymentStatus: "SUCCESS", live: true, ready: true });
  assert.equal(truth.status, "exact-live");
  assert.equal(truth.cognitionReady, true);
});
