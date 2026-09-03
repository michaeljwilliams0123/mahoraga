import test from "node:test";
import assert from "node:assert/strict";
import { createCycleId, getEightHourWindowStart, runCloudCycle } from "../src/cloud-cycle-worker.mjs";

test("creates stable eight-hour cycle identity from repository and UTC window", () => {
  assert.equal(getEightHourWindowStart(new Date("2026-09-02T17:17:00Z")), "2026-09-02T16:00:00.000Z");
  assert.equal(createCycleId({ repositoryIdentity: "owner/repo", windowStartUtc: "2026-09-02T16:00:00.000Z" }).length, 64);
});

test("waits fail-closed when no zero-credit generation provider is available", async () => {
  const result = await runCloudCycle({ repositoryIdentity: "owner/repo", providers: [], requiresGeneration: true, now: new Date("2026-09-02T17:17:00Z") });
  assert.equal(result.status, "waiting");
  assert.equal(result.providerDecision.providerId, "waiting-zero-credit-provider");
});

test("always stops a started codespace during cleanup", async () => {
  let stopped = false;
  const client = { start: async () => ({ codespaceName: "abc" }), stop: async () => { stopped = true; } };
  const providerSelector = () => ({ status: "selected", providerId: "codespaces-open-weight", costClass: "cloud-open-weight" });
  const result = await runCloudCycle({ repositoryIdentity: "owner/repo", client, providerSelector, providers: [{ id: "codespaces-open-weight" }] });
  assert.equal(result.status, "candidate-ready");
  assert.equal(stopped, true);
});
