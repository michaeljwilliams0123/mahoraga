import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeDatabase } from "../src/database.mjs";
import { createCapabilityReceipt } from "../src/receipt-registry.mjs";
import { Supervisor, sanitizeWorkerDiagnostic } from "../src/supervisor.mjs";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function databaseFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-supervisor-"));
  const database = new RuntimeDatabase(path.join(root, "state.sqlite"), { allowLegacyPlaintextWrites: true });
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
  child.sent = [];
  child.send = (message) => { child.sent.push(message); };
  child.kill = () => { child.killed = true; };
  return child;
}

test("scheduled work waits for verified live readiness and remains deduplicated", async (t) => {
  const { database, cleanup } = databaseFixture();
  const child = fakeChild();
  const manifest = manifestFixture({
    repair: { enabled: false, scanIntervalMs: 10 },
    featureFlags: { microsoftQueueWorker: true, secondaryCodexMailbox: false },
    workers: [workerDefinition({
      id: "microsoft-queue", healthProbe: "queue.poll", capabilities: ["queue.poll"],
      dataClasses: ["enterprise"], executionPlane: "licensed-cloud",
    })],
  });
  const supervisor = new Supervisor({
    manifest, database, artifactRoot: os.tmpdir(), syncCoordinationMailbox: false,
    forkWorker: () => child, tickIntervalMs: 5,
  });
  t.after(() => { supervisor.stop(); cleanup(); });

  supervisor.start();
  await delay(30);
  assert.equal(database.listTasks(500).length, 0);

  child.emit("message", { type: "process.ready" });
  child.emit("message", {
    type: "provider.readiness",
    receipt: createCapabilityReceipt("queue.poll", { verified: true, summary: "Queue provider ready." }),
    observedAt: new Date().toISOString(),
  });
  child.emit("message", { type: "readiness.complete" });
  await delay(40);
  const queueTasks = database.listTasks(500).filter((task) => task.capability === "queue.poll");
  assert.equal(queueTasks.length, 1);
  assert.ok(["queued", "running"].includes(queueTasks[0].status));
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
  assert.match(state.lastErrorDetail, /redacted/i);
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

test("worker diagnostics classify failures without retaining arbitrary stderr", () => {
  const variable = ["AWS", "SECRET", "ACCESS", "KEY"].join("_");
  const secret = ["synthetic", "sensitive", "value"].join("-");
  const prompt = ["private", "user", "request"].join("-");
  const operator = ["operator", "identity"].join("-");
  const diagnostic = `${variable}=${secret} prompt=${prompt} https://${operator}:placeholder@example.com/path Cannot find module worker.mjs`;
  const detail = sanitizeWorkerDiagnostic(diagnostic);
  assert.match(detail, /module import failed/i);
  assert.match(detail, /diagnostic [a-f0-9]{16}/i);
  for (const privateValue of [variable, secret, prompt, operator, "example.com", "worker.mjs"]) {
    assert.equal(detail.includes(privateValue), false);
  }
});

test("active scheduler deduplication is not limited to the newest 500 tasks", (t) => {
  const { database, cleanup } = databaseFixture();
  t.after(cleanup);
  database.submitTask({
    capability: "repair.apply", dataClass: "local-only", requestedMode: "local",
    idempotencyKey: "older-active-repair",
  });
  for (let index = 0; index < 501; index += 1) {
    database.submitTask({
      capability: "system.health", dataClass: "synthetic", requestedMode: "local",
      idempotencyKey: `newer-task-${index}`,
    });
  }
  assert.equal(database.hasActiveTask("repair.apply"), true);
});

test("scheduler admission uses the exact router data boundary for every scheduler", async (t) => {
  const scenarios = [
    {
      capability: "repair.apply",
      manifest: () => manifestFixture({ workers: [workerDefinition({ dataClasses: ["synthetic"] })] }),
    },
    {
      capability: "queue.poll",
      manifest: () => manifestFixture({
        repair: { enabled: false, scanIntervalMs: 10 },
        featureFlags: { microsoftQueueWorker: true, secondaryCodexMailbox: false },
        workers: [workerDefinition({
          id: "microsoft-queue", capabilities: ["queue.poll"], dataClasses: ["synthetic"],
          healthProbe: "queue.poll",
        })],
      }),
    },
    {
      capability: "repository.secondary-monitor",
      prepare: (database) => database.createSecondaryAssignment({
        title: "Observe secondary return", taskArea: "provider-adapter",
        expectedTask: "Observe one bounded return.", expectedBaseCommit: "abcdef0123456789",
        correlationId: "scheduler-router-test", allowedPaths: ["src", "test"],
      }),
      manifest: () => manifestFixture({
        repair: { enabled: false, scanIntervalMs: 10 },
        featureFlags: { microsoftQueueWorker: false, secondaryCodexMailbox: true },
        workers: [workerDefinition({
          id: "repository", capabilities: ["repository.secondary-monitor"], dataClasses: ["personal"],
          healthProbe: "repository.secondary-monitor",
        })],
      }),
    },
  ];

  for (const scenario of scenarios) {
    const { database, cleanup } = databaseFixture();
    scenario.prepare?.(database);
    const child = fakeChild();
    const supervisor = new Supervisor({
      manifest: scenario.manifest(), database, artifactRoot: os.tmpdir(), syncCoordinationMailbox: false,
      forkWorker: () => child, tickIntervalMs: 5,
    });
    supervisor.start();
    child.emit("message", { type: "ready" });
    await delay(30);
    assert.equal(
      database.listTasks(500).some((task) => task.capability === scenario.capability),
      false,
      `${scenario.capability} crossed its router data boundary`,
    );
    supervisor.stop();
    cleanup();
  }
});

test("a post-spawn child error terminates the tracked process before any restart", async (t) => {
  const { database, cleanup } = databaseFixture();
  const children = [];
  const supervisor = new Supervisor({
    manifest: manifestFixture({
      runtime: { heartbeatTimeoutMs: 5000, taskLeaseMs: 5000, maximumWorkerRestarts: 1 },
    }),
    database, artifactRoot: os.tmpdir(), syncCoordinationMailbox: false, tickIntervalMs: 1000,
    forkWorker: () => {
      const child = fakeChild(5000 + children.length);
      children.push(child);
      return child;
    },
  });
  t.after(() => { supervisor.stop(); cleanup(); });

  supervisor.start();
  children[0].emit("spawn");
  children[0].emit("message", { type: "ready" });
  children[0].emit("error", Object.assign(new Error("IPC channel closed"), { code: "EPIPE" }));
  await delay(30);

  assert.equal(children.length, 1);
  assert.equal(children[0].killed, true);
  assert.equal(supervisor.status()[0].status, "crashed");
  assert.equal(supervisor.status()[0].lastErrorCode, "process-EPIPE");
});

test("route recovery requeues a running task without losing its identity", (t) => {
  const { database, cleanup } = databaseFixture();
  t.after(cleanup);
  const conversation = database.createConversation({
    title: "Recovery test", initialMessage: "Keep this objective alive.", classification: "local-only",
  });
  const submitted = database.submitTask({
    capability: "system.health", dataClass: "synthetic", requestedMode: "local",
    idempotencyKey: "route-recovery-key", correlationId: "route-recovery-correlation",
    conversationId: conversation.id, maximumAttempts: 3,
  });
  const claimed = database.claimNext({ workerId: "repair-worker", capabilities: ["system.health"], leaseMs: 5000 });
  assert.equal(claimed.id, submitted.id);
  const recovered = database.requeueForRouteRecovery({
    taskId: claimed.id, reason: "canary-stale", excludedWorkerId: "repair-worker",
  });
  assert.equal(recovered.status, "queued");
  assert.equal(recovered.attemptCount, 1);
  assert.equal(recovered.idempotencyKey, "route-recovery-key");
  assert.equal(recovered.correlationId, "route-recovery-correlation");
  assert.equal(recovered.conversationId, conversation.id);
  assert.equal(recovered.errorCode, "route-recovery-canary-stale");
  assert.deepEqual(recovered.excludedWorkerIds, ["repair-worker"]);
  const events = database.listEvents(50).filter((event) => event.subjectId === claimed.id);
  assert.equal(events.some((event) => event.eventType === "task.route-recovered"), true);
  assert.equal(events.some((event) => event.eventType === "task.waiting"), false);
});
test("supervisor keeps a task queued across recoverable stale-route drift", async (t) => {
  const { database, cleanup } = databaseFixture();
  const child = fakeChild();
  const manifest = manifestFixture({ repair: { enabled: false, scanIntervalMs: 1000 } });
  const supervisor = new Supervisor({
    manifest, database, artifactRoot: os.tmpdir(), syncCoordinationMailbox: false,
    forkWorker: () => child, tickIntervalMs: 200,
  });
  t.after(() => { supervisor.stop(); cleanup(); });
  supervisor.start();
  child.emit("process.ready");
  child.emit("message", { type: "process.ready" });
  child.emit("message", { type: "readiness.complete" });
  const observedAt = new Date().toISOString();
  database.setCapabilityReadiness({
    workerId: "repair-worker", capability: "system.health", processStatus: "live",
    providerStatus: "ready", canaryStatus: "stale", processObservedAt: observedAt,
    providerObservedAt: observedAt, canaryVerifiedAt: null, lastErrorCode: null,
  });
  const submitted = database.submitTask({
    capability: "system.health", dataClass: "synthetic", requestedMode: "local",
    idempotencyKey: "supervisor-route-recovery", maximumAttempts: 3,
  });
  await delay(230);
  supervisor.stop();
  const recovered = database.getTask(submitted.id);
  assert.equal(recovered.status, "queued");
  assert.equal(recovered.attemptCount, 1);
  assert.equal(recovered.errorCode, "route-recovery-canary-stale");
});
test("stale route recovery asks the worker to refresh readiness before retrying", async (t) => {
  const { database, cleanup } = databaseFixture();
  const child = fakeChild();
  const manifest = manifestFixture({ repair: { enabled: false, scanIntervalMs: 1000 } });
  const supervisor = new Supervisor({
    manifest, database, artifactRoot: os.tmpdir(), syncCoordinationMailbox: false,
    forkWorker: () => child, tickIntervalMs: 200,
  });
  t.after(() => { supervisor.stop(); cleanup(); });
  supervisor.start();
  child.emit("message", { type: "process.ready" });
  child.emit("message", { type: "readiness.complete" });
  const observedAt = new Date().toISOString();
  database.setCapabilityReadiness({
    workerId: "repair-worker", capability: "system.health", processStatus: "live",
    providerStatus: "ready", canaryStatus: "stale", processObservedAt: observedAt,
    providerObservedAt: observedAt, canaryVerifiedAt: null, lastErrorCode: null,
  });
  database.submitTask({
    capability: "system.health", dataClass: "synthetic", requestedMode: "local",
    idempotencyKey: "supervisor-refresh-stale-readiness", maximumAttempts: 3,
  });
  await delay(230);
  assert.equal(child.sent.some((message) => message?.type === "readiness.refresh"), true);
});

test("supervisor preserves terminal waiting after route-recovery attempts are exhausted", async (t) => {
  const { database, cleanup } = databaseFixture();
  const child = fakeChild();
  const manifest = manifestFixture({ repair: { enabled: false, scanIntervalMs: 1000 } });
  const supervisor = new Supervisor({
    manifest, database, artifactRoot: os.tmpdir(), syncCoordinationMailbox: false,
    forkWorker: () => child, tickIntervalMs: 200,
  });
  t.after(() => { supervisor.stop(); cleanup(); });
  supervisor.start();
  child.emit("message", { type: "process.ready" });
  child.emit("message", { type: "readiness.complete" });
  const observedAt = new Date().toISOString();
  database.setCapabilityReadiness({
    workerId: "repair-worker", capability: "system.health", processStatus: "live",
    providerStatus: "ready", canaryStatus: "stale", processObservedAt: observedAt,
    providerObservedAt: observedAt, canaryVerifiedAt: null, lastErrorCode: null,
  });
  const submitted = database.submitTask({
    capability: "system.health", dataClass: "synthetic", requestedMode: "local",
    idempotencyKey: "supervisor-route-exhausted", maximumAttempts: 1,
  });
  await delay(230);
  supervisor.stop();
  const terminal = database.getTask(submitted.id);
  assert.equal(terminal.status, "waiting");
  assert.equal(terminal.attemptCount, 1);
  assert.equal(terminal.errorCode, "canary-stale");
});

test("Copilot Studio health evidence becomes runtime-owned authority and billing state", async (t) => {
  const { database, cleanup } = databaseFixture();
  const child = fakeChild(5151);
  const definition = workerDefinition({
    id: "copilot-studio", label: "Copilot Studio Agent", healthProbe: "studio.health",
    capabilities: ["studio.health", "studio.delegate"], dataClasses: ["enterprise"],
    costClass: "licensed-cloud", executionPlane: "licensed-cloud",
  });
  const supervisor = new Supervisor({
    manifest: manifestFixture({ workers: [definition] }), database, artifactRoot: os.tmpdir(),
    syncCoordinationMailbox: false, forkWorker: () => child, tickIntervalMs: 1000,
  });
  t.after(() => { supervisor.stop(); cleanup(); });
  supervisor.start();
  child.emit("message", { type: "process.ready" });
  child.emit("message", {
    type: "provider.readiness", observedAt: new Date().toISOString(),
    receipt: createCapabilityReceipt("studio.health", { verified: true, summary: "Studio ready.", providerHealth: {
      platformAuthorityScopes: ["connector.invoke", "copilot.invoke"], delegateBillingClass: "license-included",
    } }),
  });
  child.emit("message", { type: "readiness.complete" });
  const state = supervisor.status()[0];
  assert.deepEqual(state.platformAuthorityScopes, ["connector.invoke", "copilot.invoke"]);
  assert.deepEqual(state.billingAttestationByCapability, { "studio.delegate": "license-included" });
});