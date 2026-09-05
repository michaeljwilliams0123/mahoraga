import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createCycleId, getFourHourWindowStart, runCloudCycle } from "../src/cloud-cycle-worker.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("creates stable four-hour cycle identity from repository and UTC window", () => {
  assert.equal(getFourHourWindowStart(new Date("2026-09-02T17:17:00Z")), "2026-09-02T16:00:00.000Z");
  assert.equal(getFourHourWindowStart(new Date("2026-09-02T21:17:00Z")), "2026-09-02T20:00:00.000Z");
  assert.equal(createCycleId({ repositoryIdentity: "owner/repo", windowStartUtc: "2026-09-02T16:00:00.000Z" }).length, 64);
});

test("waits fail-closed when no zero-credit generation provider is available", async () => {
  const result = await runCloudCycle({ repositoryIdentity: "owner/repo", providers: [], requiresGeneration: true, now: new Date("2026-09-02T17:17:00Z") });
  assert.equal(result.status, "waiting");
  assert.equal(result.providerDecision.providerId, "waiting-zero-credit-provider");
});

test("always stops a started codespace after producing a concrete candidate receipt", async () => {
  let stopped = false;
  const client = {
    start: async () => ({ action: "start", status: "ok", codespaceIdHash: "opaque" }),
    stopActive: async () => { stopped = true; return { action: "stop", status: "ok" }; },
  };
  const providerSelector = () => ({ status: "selected", providerId: "codespaces-open-weight", costClass: "cloud-open-weight" });
  const candidate = {
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    branch: "feature/mahoraga-auto-cycle",
    pullRequestNumber: 91,
    changedFilesDigest: "c".repeat(64),
  };
  const result = await runCloudCycle({
    repositoryIdentity: "owner/repo",
    client,
    providerSelector,
    providers: [{ id: "codespaces-open-weight" }],
    candidateProducer: async () => candidate,
  });
  assert.equal(result.status, "candidate-ready");
  assert.deepEqual(result.candidate, candidate);
  assert.equal(stopped, true);
});

test("cloud-cycle CLI executes and emits a receipt on every supported runner OS", () => {
  const result = spawnSync(process.execPath, ["src/cloud-cycle-worker.mjs"], {
    cwd: ROOT,
    env: {
      ...process.env,
      GITHUB_REPOSITORY: "owner/repo",
      MAHORAGA_CANDIDATE_PRODUCER: "",
      MAHORAGA_LOCAL_REASONER_READY: "false",
      MAHORAGA_PLATFORM_API_KEY_PRESENT: "false",
      MAHORAGA_ALLOW_PAID_FALLBACK: "false",
    },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.workflowVersion, "sovereign-four-hour-cycle/v1");
  assert.equal(typeof receipt.status, "string");
  assert.equal(receipt.branch, "main");
});
