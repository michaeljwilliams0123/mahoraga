import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_SHA = /^[a-f0-9]{40}$/;
const KINDS = new Set(["candidate-cycle", "producer-smoke"]);
const JOB_STATES = new Set(["success", "failure", "cancelled", "skipped", "unknown"]);
const TERMINAL_STATES = new Set(["candidate-ready", "no-candidate", "failed", "hold-planned"]);

export function sourceScopedSmokeTag(sha) {
  if (typeof sha !== "string" || !SOURCE_SHA.test(sha)) throw Error("source-sha-invalid");
  return `sovereign-producer-smoke-v2-${sha.slice(0, 16)}`;
}

export function summarizeSovereignWorkflow({
  kind, sourceSha, runId, jobStatus = "unknown", admitted = "",
  workerStatus = "", artifactStatus = "", preflight = "", windowStartUtc = "",
} = {}) {
  if (!KINDS.has(kind)) throw Error("workflow-kind-invalid");
  if (typeof sourceSha !== "string" || !SOURCE_SHA.test(sourceSha)) throw Error("source-sha-invalid");
  if (typeof runId !== "string" || !/^[1-9][0-9]{0,19}$/.test(runId)) throw Error("run-id-invalid");
  const job = JOB_STATES.has(jobStatus) ? jobStatus : "unknown";
  const status = TERMINAL_STATES.has(workerStatus) ? workerStatus : "";
  const artifact = artifactStatus === "success" ? "success" : "not-confirmed";
  let disposition;
  if (job !== "success") disposition = "job-not-successful";
  else if (admitted !== "true") disposition = "not-run";
  else if (preflight === "hold-planned" || status === "hold-planned") disposition = "held";
  else if (status === "candidate-ready") disposition = artifact === "success" ? "candidate-ready" : "unverified-candidate";
  else if (status === "no-candidate") disposition = "no-candidate";
  else if (status === "failed") disposition = "failed";
  else disposition = "incomplete";
  const result = {
    schemaVersion: 1,
    kind,
    sourceSha,
    runId,
    workflowSucceeded: job === "success",
    candidateProven: disposition === "candidate-ready",
    disposition,
    artifactRetention: artifact,
  };
  if (typeof windowStartUtc === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(windowStartUtc)) {
    result.windowStartUtc = windowStartUtc;
  }
  return Object.freeze(result);
}

function runCli(args = process.argv.slice(2), env = process.env) {
  if (args[0] === "smoke-tag") {
    if (args.length !== 2) throw Error("smoke-tag-argument-invalid");
    process.stdout.write(sourceScopedSmokeTag(args[1]) + "\n");
    return;
  }
  if (args[0] !== "artifact" || args.length !== 1) throw Error("sovereign-evidence-command-invalid");
  const report = summarizeSovereignWorkflow({
    kind: env.SOVEREIGN_EVIDENCE_KIND,
    sourceSha: env.SOVEREIGN_SOURCE_SHA,
    runId: env.GITHUB_RUN_ID,
    jobStatus: env.SOVEREIGN_JOB_STATUS,
    admitted: env.SOVEREIGN_ADMITTED,
    workerStatus: env.SOVEREIGN_WORKER_STATUS,
    artifactStatus: env.SOVEREIGN_ARTIFACT_STATUS,
    preflight: env.SOVEREIGN_PREFLIGHT,
    windowStartUtc: env.SOVEREIGN_WINDOW,
  });
  process.stdout.write(JSON.stringify(report) + "\n");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runCli(); } catch (error) {
    process.stderr.write((/^[a-z-]+$/.test(error?.message ?? "") ? error.message : "sovereign-evidence-invalid") + "\n");
    process.exitCode = 1;
  }
}
