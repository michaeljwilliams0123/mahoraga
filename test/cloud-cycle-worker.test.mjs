import test from "node:test";
import assert from "node:assert/strict";
import { createCycleId, getFourHourWindowStart, runCloudCycle } from "../src/cloud-cycle-worker.mjs";

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
