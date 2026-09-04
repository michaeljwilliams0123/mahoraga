import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { runCloudCycle } from "../src/cloud-cycle-worker.mjs";

async function workflow(name) {
  return readFile(path.join(ROOT, ".github", "workflows", name), "utf8");
}

test("four-hour dry cycle cannot claim candidate-ready without a concrete candidate", async () => {
  const result = await runCloudCycle({
    repositoryIdentity: "owner/repo",
    providers: [],
    requiresGeneration: false,
    cloudModeEnabled: false,
    now: new Date("2026-09-04T16:17:00Z"),
  });
  assert.equal(result.status, "no-candidate");
  assert.equal(result.terminalReason, "candidate-producer-unavailable");
  assert.equal(result.candidate, null);
  assert.equal(result.events.at(-1).state, "no-candidate");
});

test("candidate-ready requires an immutable candidate receipt", async () => {
  const candidate = {
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    branch: "feature/mahoraga-auto-example",
    pullRequestNumber: 91,
    changedFilesDigest: "c".repeat(64),
  };
  const result = await runCloudCycle({
    repositoryIdentity: "owner/repo",
    providers: [],
    requiresGeneration: false,
    cloudModeEnabled: false,
    candidateProducer: async () => candidate,
    now: new Date("2026-09-04T16:17:00Z"),
  });
  assert.equal(result.status, "candidate-ready");
  assert.deepEqual(result.candidate, candidate);
  assert.equal(result.terminalReason, "candidate-produced");
});

test("autonomous integration keeps evaluation read-only and grants writes only to merge", async () => {
  const source = await workflow("autonomous-integration.yml");
  assert.match(source, /permissions:\s*\n\s*actions: read\s*\n\s*contents: read\s*\n\s*pull-requests: read/);
  assert.match(source, /\n  evaluate:\s*\n\s*permissions:\s*\n\s*actions: read\s*\n\s*contents: read\s*\n\s*pull-requests: read/);
  assert.match(source, /\n  merge:\s*\n\s*needs: evaluate[\s\S]*?permissions:\s*\n\s*actions: write\s*\n\s*contents: write\s*\n\s*pull-requests: write/);
  assert.match(source, /ref: main\s*\n\s*persist-credentials: false/);
});

test("automatic release accepts only trusted verification of still-current main", async () => {
  const source = await workflow("release.yml");
  assert.match(source, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(source, /github\.event\.workflow_run\.event == 'workflow_dispatch'/);
  assert.match(source, /github\.event\.workflow_run\.actor\.login == 'github-actions\[bot\]'/);
  assert.match(source, /name: Verify automatic release SHA is still current main/);
  assert.match(source, /git fetch origin main/);
  assert.match(source, /git rev-parse origin\/main/);
  assert.match(source, /stale-verified-main/);

  const baseline = await readFile(path.join(ROOT, "state", "release-baseline", ".github", "workflows", "release.yml"), "utf8");
  assert.equal(baseline, source);
});
