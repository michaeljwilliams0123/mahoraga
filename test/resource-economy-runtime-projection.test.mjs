import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeDatabase } from "../src/database.mjs";
import { createCapabilityReceipt } from "../src/receipt-registry.mjs";
import { buildCapabilityRegistry } from "../src/capability-registry.mjs";
import { Supervisor } from "../src/supervisor.mjs";

const NOW = "2026-09-13T03:30:00.000Z";
const EXPIRES = "2026-09-13T03:35:00.000Z";

function workerDefinition() {
  return {
    id: "free-tier-worker",
    label: "Free Tier Worker",
    version: "1.0.0",
    enabled: true,
    healthProbe: "system.health",
    capabilities: ["system.health"],
    billingClassByCapability: { "system.health": "free-tier-zero" },
    dataClasses: ["synthetic"],
    executionPlane: "cloud",
    timeoutMs: 5000,
    costClass: "cloud-open-weight",
    routing: {
      interfaceType: "native-api",
      permissionClass: "bounded-cloud",
      reliability: 99,
      requiresAttendedDesktop: false,
      executionType: "isolated-process",
      latencyMs: 1,
      maximumWorkload: 1,
      fallbackWorkerIds: [],
    },
  };
}

function manifestFixture() {
  return {
    defaultAutonomyMode: "hybrid",
    runtime: { heartbeatTimeoutMs: 5000, taskLeaseMs: 5000, maximumWorkerRestarts: 0 },
    routingPolicy: {
      interfaceOrder: ["native-api"],
      availabilityOrder: ["healthy", "busy", "starting", "configured"],
      minimumReliability: 60,
    },
    costModes: { hybrid: ["cloud-open-weight"] },
    workers: [workerDefinition()],
    repair: { enabled: false, scanIntervalMs: 1000 },
    queue: { pollIntervalMs: 1000 },
    featureFlags: { microsoftQueueWorker: false, secondaryCodexMailbox: false },
  };
}

function fakeChild() {
  const child = new EventEmitter();
  child.pid = 9001;
  child.stderr = new EventEmitter();
  child.send = () => {};
  child.kill = () => {};
  return child;
}

test("verified worker quota evidence reaches the live capability projection", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-quota-projection-"));
  const database = new RuntimeDatabase(path.join(root, "state.sqlite"), { allowLegacyPlaintextWrites: true });
  const child = fakeChild();
  const manifest = manifestFixture();
  const supervisor = new Supervisor({
    manifest,
    database,
    artifactRoot: root,
    syncCoordinationMailbox: false,
    forkWorker: () => child,
    tickIntervalMs: 1000,
  });
  t.after(() => {
    supervisor.stop();
    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  supervisor.start();
  child.emit("message", { type: "process.ready" });
  child.emit("message", {
    type: "provider.readiness",
    observedAt: NOW,
    receipt: createCapabilityReceipt("system.health", {
      verified: true,
      summary: "Free-tier worker ready.",
      providerHealth: {
        resourceEconomyAttestationByCapability: {
          "system.health": { status: "available", observedAt: NOW, expiresAt: EXPIRES },
        },
      },
    }, { observedAt: NOW }),
  });
  child.emit("message", { type: "readiness.complete" });

  const state = supervisor.status()[0];
  assert.deepEqual(state.resourceEconomyAttestationByCapability, {
    "system.health": { status: "available", observedAt: NOW, expiresAt: EXPIRES },
  });

  const route = buildCapabilityRegistry(manifest, supervisor.status(), Date.parse(NOW))
    .find((item) => item.workerId === "free-tier-worker" && item.capability === "system.health");
  assert.deepEqual(route?.quotaAttestation, {
    status: "available",
    observedAt: NOW,
    expiresAt: EXPIRES,
  });
});
