import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const modulePath = new URL("../src/state/core-plane.mjs", import.meta.url);
const VAULT_REF = "vault:11111111-1111-4111-8111-111111111111";

async function loadCoreModule() {
  assert.equal(existsSync(modulePath), true, "src/state/core-plane.mjs must exist");
  return import(modulePath.href);
}

function makeVault({ writes = [], removals = [] } = {}) {
  return {
    put(value, expected) {
      const bytes = Buffer.from(value);
      writes.push({ bytes, expected });
      return VAULT_REF;
    },
    metadata(reference, expected) {
      assert.equal(reference, VAULT_REF);
      return {
        schemaVersion: 1,
        reference,
        classification: expected.classification,
        ownerType: expected.ownerType,
        ownerId: expected.ownerId,
        sizeBytes: writes.at(-1)?.bytes.length ?? 0,
        sha256: "a".repeat(64),
        createdAt: 10_000,
        expiresAt: 20_000,
      };
    },
    remove(reference, expected) {
      removals.push({ reference, expected });
      return true;
    },
  };
}

test("cognitive plane is candidate-only and vaults decision content before metadata persistence", async () => {
  const { createAdminCognitivePlane } = await loadCoreModule();
  assert.throws(() => createAdminCognitivePlane({ port: 4782, stateStore: {}, telemetryRegistry: {} }), /uccp-candidate-port-required/);

  const leases = [];
  const vaultWrites = [];
  let telemetry;
  const plane = createAdminCognitivePlane({
    port: 4783,
    now: () => 10_000,
    contentVault: makeVault({ writes: vaultWrites }),
    stateStore: {
      recordLease(input) { leases.push(input); return { ...input }; },
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
  assert.equal(vaultWrites.length, 1);
  assert.equal(vaultWrites[0].expected.classification, "local-only");
  assert.equal(vaultWrites[0].expected.ownerType, "uccp");
  assert.match(vaultWrites[0].expected.ownerId, /^uccp-[0-9a-f-]{36}$/);
  const vaulted = JSON.parse(vaultWrites[0].bytes.toString("utf8"));
  assert.equal(typeof vaulted.proposal, "string");
  assert.equal(typeof vaulted.challenge, "string");
  assert.equal(typeof vaulted.synthesis, "string");

  assert.equal(leases.length, 1);
  assert.equal(leases[0].currentNode, "Synthesis");
  assert.deepEqual(leases[0].decisionSummary, {
    schemaVersion: 1,
    outcome: "stable",
    contentRef: VAULT_REF,
    contentSha256: "a".repeat(64),
    contentBytes: vaultWrites[0].bytes.length,
    contentClassification: "local-only",
    contentKind: "uccp-decision-summary",
  });
  assert.equal("proposal" in leases[0].decisionSummary, false);
  assert.equal("challenge" in leases[0].decisionSummary, false);
  assert.equal("synthesis" in leases[0].decisionSummary, false);
  assert.equal(JSON.stringify(leases).includes("Observe 1 worker"), false);
  assert.equal(JSON.stringify(telemetry).includes("Observe 1 worker"), false);
  assert.deepEqual(telemetry.generativeState.decisionSummary, leases[0].decisionSummary);
  assert.equal(result.telemetry.predictiveMetrics.databaseHealth, "WAL_OK");
  assert.equal(result.telemetry.agenticStatus.activeLeases, 1);
});

test("cognitive plane requires the canonical content vault and cleans an orphan if lease persistence fails", async () => {
  const { createAdminCognitivePlane } = await loadCoreModule();
  const stateStore = {
    recordLease() { throw new Error("persist-failed"); },
    health() { return { journalMode: "wal", integrity: "ok" }; },
  };
  const telemetryRegistry = { update() {} };
  assert.throws(() => createAdminCognitivePlane({ port: 4783, stateStore, telemetryRegistry }), /uccp-content-vault-required/);

  const writes = [];
  const removals = [];
  const plane = createAdminCognitivePlane({
    port: 4783,
    stateStore,
    telemetryRegistry,
    contentVault: makeVault({ writes, removals }),
    snapshot: async () => ({ workers: [], tasks: [], driftRisk: "ELEVATED" }),
  });
  await assert.rejects(() => plane.cycle(), /persist-failed/);
  assert.equal(writes.length, 1);
  assert.equal(removals.length, 1);
  assert.equal(removals[0].reference, VAULT_REF);
  assert.deepEqual(removals[0].expected, writes[0].expected);
});
