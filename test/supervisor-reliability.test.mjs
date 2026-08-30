import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeDatabase } from "../src/database.mjs";
import { Supervisor } from "../src/supervisor.mjs";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function databaseFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-supervisor-"));
  const database = new RuntimeDatabase(path.join(root, "state.sqlite"));
  return {
    database,
    cleanup: () => { database.close(); rmSync(root, { recursive: true, force: true }); },
  };
}

function workerDefinition(overrides = {}) {
  return {
    id: "repair-worker", label: "Repair Worker", version: "1.0.0", enabled: true,
    healthProbe: "system.health", capabilities: ["repair.apply", "system.health"],
    dataClasses: ["local-only", "synthetic"], executionPlane: "local", timeoutMs: 5000,
    costClass: "deterministic",
    routing: {
      interfaceType: "deterministic-worker", permissionClass: "bounded-local", reliability: 99,
      requiresAttendedDesktop: false, executionType: "isolated-process", latencyMs: 1,
      maximumWorkload: 1, fallbackWorkerIds: [],
    },
    ...overrides,
  };
}

function manifestFixture(overrides = {}) {
  return {
    defaultAutonomyMode: "local",
    runtime: { heartbeatTimeoutMs: 5000, taskLeaseMs: 5000, maximumWorkerRestarts: 0 },
    routingPolicy: {
      interfaceOrder: ["deterministic-worker"], availabilityOrder: ["healthy", "busy", "starting"],
      minimumReliability: 60,
    },
    costModes: { local: ["deterministic"], hybrid: ["deterministic"], maximum: ["deterministic"] },
    workers: [workerDefinition()],
    repair: { enabled: true, scanIntervalMs: 10 },
    queue: { pollIntervalMs: 10 },
    featureFlags: { microsoftQueueWorker: false, secondaryCodexMailbox: false },
    ...overrides,
  };
}

function fakeChild(pid = 4242) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stderr = new EventEmitter();
  child.send = () => {};
  child.kill = () => { child.killed = true; };
  return child;
}

test("scheduled work waits for a healthy compatible worker and remains deduplicated", async (t) => {
  const { database, cleanup } = databaseFixture();
  const child = fakeChild();
  const supervisor = new Supervisor({
    manifest: manifestFixture(), database, artifactRoot: os.tmpdir(), syncCoordinationMailbox: false,
    forkWorker: () => child, tickIntervalMs: 5,
  });
  t.after(() => { supervisor.stop(); cleanup(); });

  supervisor.start();
  await delay(30);
  assert.equal(database.listTasks(500).length, 0);

  child.emit("message", { type: "ready" });
  await delay(40);
  const repairTasks = database.listTasks(500).filter((task) => task.capability === "repair.apply");
  assert.equal(repairTasks.length, 1);
  assert.ok(["queued", "running"].includes(repairTasks[0].status));
});

test("startup reconciles persisted workers that have no live process", (t) => {
  const { database, cleanup } = databaseFixture();
  database.setWorkerState({ workerId: "removed-worker", status: "healthy", pid: 9999, restartCount: 2, lastHeartbeatAt: new Date().toISOString() });
  const supervisor = new Supervisor({
    manifest: manifestFixture(), database, artifactRoot: os.tmpdir(), syncCoordinationMailbox: false,
    forkWorker: () => fakeChild(), tickIntervalMs: 1000,
  });
  t.after(() => { supervisor.stop(); cleanup(); });

  supervisor.start();
  const stale = database.listWorkerState().find((worker) => worker.workerId === "removed-worker");
  assert.equal(stale.status, "stale");
  assert.equal(stale.pid, null);
  assert.equal(stale.lastErrorCode, "process-not-live");
});

test("worker stderr and exit failures are surfaced with secrets redacted", (t) => {
  const { database, cleanup } = databaseFixture();
  const child = fakeChild();
  const supervisor = new Supervisor({
    manifest: manifestFixture(), database, artifactRoot: os.tmpdir(), syncCoordinationMailbox: false,
    forkWorker: () => child, tickIntervalMs: 1000,
  });
  t.after(() => { supervisor.stop(); cleanup(); });

  supervisor.start();
  child.stderr.emit("data", Buffer.from("OPENAI_API_KEY=super-secret-value module import failed\n"));
  child.emit("exit", 1, null);

  const state = database.listWorkerState().find((worker) => worker.workerId === "repair-worker");
  assert.equal(state.status, "quarantined");
  assert.equal(state.lastErrorCode, "exit-1");
  assert.match(state.lastErrorDetail, /\[redacted\]/i);
  assert.match(state.lastErrorDetail, /module import failed/i);
  assert.doesNotMatch(state.lastErrorDetail, /super-secret-value/);
});

test("synchronous worker spawn failures remain visible after quarantine", (t) => {
  const { database, cleanup } = databaseFixture();
  const spawnError = Object.assign(new Error("worker entrypoint was not found"), { code: "ENOENT" });
  const supervisor = new Supervisor({
    manifest: manifestFixture(), database, artifactRoot: os.tmpdir(), syncCoordinationMailbox: false,
    forkWorker: () => { throw spawnError; }, tickIntervalMs: 1000,
  });
  t.after(() => { supervisor.stop(); cleanup(); });

  supervisor.start();
  const persisted = database.listWorkerState().find((worker) => worker.workerId === "repair-worker");
  assert.equal(persisted.status, "quarantined");
  assert.equal(persisted.lastErrorCode, "spawn-ENOENT");
  assert.match(persisted.lastErrorDetail, /entrypoint was not found/i);
  assert.equal(supervisor.status()[0].status, "quarantined");
});
