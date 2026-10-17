import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  sourceScopedSmokeTag,
  summarizeSovereignWorkflow,
} from "../scripts/sovereign-workflow-evidence.mjs";

const sha = "d49f8b2a2d613c155bb01a459091a0dce5ee4b0c";
const other = "2613fa44eb02bb87e27792a1440234367394029e";

test("smoke tag is exact-source scoped and cannot globally suppress later releases", () => {
  assert.equal(sourceScopedSmokeTag(sha), "sovereign-producer-smoke-v2-d49f8b2a2d613c15");
  assert.notEqual(sourceScopedSmokeTag(sha), sourceScopedSmokeTag(other));
  assert.throws(() => sourceScopedSmokeTag("main"), /source-sha-invalid/);
});

test("a successful Actions job with skipped candidate steps never claims candidate production", () => {
  const evidence = summarizeSovereignWorkflow({
    kind: "candidate-cycle", sourceSha: sha, runId: "39012109520",
    jobStatus: "success", admitted: "false", workerStatus: "", artifactStatus: "",
  });
  assert.equal(evidence.disposition, "not-run");
  assert.equal(evidence.candidateProven, false);
  assert.equal(evidence.workflowSucceeded, true);
  assert.equal(evidence.sourceSha, sha);
  assert.equal(evidence.runId, "39012109520");
});

test("completed worker with no candidate is not reported as a new PR", () => {
  const evidence = summarizeSovereignWorkflow({
    kind: "candidate-cycle", sourceSha: sha, runId: "39008706764",
    jobStatus: "success", admitted: "true", workerStatus: "no-candidate", artifactStatus: "skipped",
  });
  assert.equal(evidence.disposition, "no-candidate");
  assert.equal(evidence.candidateProven, false);
});

test("candidate is proven only with validated result and successful artifact retention", () => {
  const base = {kind: "producer-smoke", sourceSha: sha, runId: "39012109520",
    admitted: "true", workerStatus: "candidate-ready", jobStatus: "success"};
  assert.equal(summarizeSovereignWorkflow({...base, artifactStatus: "success"}).candidateProven, true);
  assert.equal(summarizeSovereignWorkflow({...base, artifactStatus: "failure"}).candidateProven, false);
  assert.equal(summarizeSovereignWorkflow({...base, artifactStatus: ""}).disposition, "unverified-candidate");
});

test("holds and workflow failures remain observable and never claim success", () => {
  const base = {kind: "candidate-cycle", sourceSha: sha, runId: "42", admitted: "true"};
  assert.equal(summarizeSovereignWorkflow({...base, jobStatus: "success", workerStatus: "", preflight: "hold-planned"}).disposition, "held");
  assert.equal(summarizeSovereignWorkflow({...base, jobStatus: "failure", workerStatus: "candidate-ready", artifactStatus: "success"}).candidateProven, false);
});

test("dispositions do not accept uncontrolled or sensitive source fields", () => {
  assert.throws(() => summarizeSovereignWorkflow({kind: "candidate-cycle",sourceSha:sha,runId:"not-an-id"}), /run-id-invalid/);
  assert.throws(() => summarizeSovereignWorkflow({kind: "arbitrary",sourceSha:sha,runId:"1"}), /workflow-kind-invalid/);
});

test("workflow publishes sanitized receipts for executed or suppressed cycles", () => {
  const workflow = readFileSync(new URL("../.github/workflows/sovereign-eight-hour-cycle.yml", import.meta.url), "utf8");
  assert.match(workflow, /sourceScopedSmokeTag|smoke-tag.*RELEASED_SHA/);
  assert.match(workflow, /SOVEREIGN_SOURCE_SHA:.*steps\.cadence\.outputs\.current_main/);
  assert.match(workflow, /SOVEREIGN_SOURCE_SHA:.*steps\.smoke\.outputs\.released_sha/);
  assert.match(workflow, /scripts\/sovereign-workflow-evidence\.mjs artifact/g);
  assert.match(workflow, /sovereign-candidate-outcome\.json/);
  assert.match(workflow, /sovereign-producer-outcome\.json/);
});
