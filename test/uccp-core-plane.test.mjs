import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const modulePath = new URL("../src/state/core-plane.mjs", import.meta.url);

async function loadCoreModule() {
  assert.equal(existsSync(modulePath), true, "src/state/core-plane.mjs must exist");
  return import(modulePath.href);
}

test("cognitive plane is candidate-only and persists bounded synthesis", async () => {
  const { createAdminCognitivePlane } = await loadCoreModule();
  assert.throws(() => createAdminCognitivePlane({ port: 4782, stateStore: {}, telemetryRegistry: {} }), /uccp-candidate-port-required/);

  const leases = [];
  let telemetry;
  const plane = createAdminCognitivePlane({
    port: 4783,
    now: () => 10_000,
    stateStore: {
      recordLease(input) { leases.push(input); return { ...input, leaseId: input.leaseId ?? "lease-test" }; },
      listActiveLeases() { return leases; },
      health() { return { journalMode: "wal", integrity: "ok" }; },
    },
    telemetryRegistry: {
      update(next) { telemetry = next; },
      snapshot() { return telemetry; },
    },
    snapshot: async () => ({
      workers: [{ id: "repository", status: "ready" }],
      tasks: [{ id: "task-1", status: "queued" }],
      driftRisk: "STABLE",
    }),
  });

  const result = await plane.cycle();
  assert.equal(leases.length, 1);
  assert.equal(leases[0].currentNode, "Synthesis");
  assert.equal(typeof leases[0].decisionSummary.proposal, "string");
  assert.equal(typeof leases[0].decisionSummary.challenge, "string");
  assert.equal(typeof leases[0].decisionSummary.synthesis, "string");
  assert.equal(JSON.stringify(leases).includes("currentThoughtChain"), false);
  assert.equal(JSON.stringify(leases).includes("chainOfThought"), false);
  assert.equal(result.telemetry.predictiveMetrics.databaseHealth, "WAL_OK");
  assert.equal(result.telemetry.agenticStatus.activeLeases, 1);
});