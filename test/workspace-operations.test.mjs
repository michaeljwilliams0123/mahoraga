import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeDatabase } from "../src/database.mjs";
import {
  OPERATIONS_ACTION_IDS,
  classifyOperationalTone,
  executeOperationsAction,
  operationsSnapshot,
} from "../src/workspace-operations.mjs";

const HEAD = "a".repeat(40);

function assertNoSensitiveKeys(value, pathLabel = "$") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.doesNotMatch(
      key,
      /token|secret|password|cookie|authorization|privateKey/i,
      `sensitive key at ${pathLabel}.${key}`,
    );
    assertNoSensitiveKeys(child, `${pathLabel}.${key}`);
  }
}

function fixture(t, { tasks = [], objectives = [], incidents = [], workers = [], evolution = [] } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-workspace-operations-"));
  const database = new RuntimeDatabase(path.join(root, "state.sqlite"), { allowLegacyPlaintextWrites: true });
  t.after(() => {
    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  const createdTasks = [];
  for (const task of tasks) {
    const created = database.submitTask({
      capability: task.capability ?? "system.health",
      dataClass: "synthetic",
      requestedMode: "local",
      requestedOutcome: task.requestedOutcome ?? "bounded outcome",
      idempotencyKey: task.idempotencyKey ?? `task-${createdTasks.length + 1}`,
      conversationId: task.conversationId,
    });
    if (task.status === "cancelled") database.cancelTask(created.id);
    else if (task.status === "failed") {
      database.claimNext({ workerId: "local-core", capabilities: ["system.health"], leaseMs: 5000 });
      database.finishTask(created.id, { status: "failed", errorCode: "test-failed" });
    } else if (task.status && task.status !== "queued") {
      // leave queued by default; other statuses set via finish/cancel only when needed
    }
    createdTasks.push(database.getTask(created.id));
  }

  const manifest = {
    version: "7.0.0-alpha.2",
    versions: { runtime: "7.0.0-alpha.2" },
    autonomy: { baseline: "ultron" },
    repair: { baselineDirectory: "state/release-baseline" },
  };

  const supervisor = {
    status: () => workers.map((worker) => ({
      workerId: worker.id,
      status: worker.state ?? "live",
      capabilities: worker.capabilities ?? ["system.health"],
      lastHeartbeatAt: worker.lastHeartbeatAt ?? new Date().toISOString(),
    })),
    health: () => ({
      supervisorRunning: true,
      healthy: true,
      unhealthyWorkers: [],
      repairScan: { activeIncidents: incidents.length, healthy: incidents.length === 0 },
    }),
  };

  // Seed objectives / incidents / evolution via lightweight stubs when DB APIs allow.
  const originalListObjectives = database.listObjectives.bind(database);
  database.listObjectives = (limit = 100) => {
    if (objectives.length === 0) return originalListObjectives(limit);
    return objectives.slice(0, limit);
  };
  const originalListRepair = database.listRepairIncidents.bind(database);
  database.listRepairIncidents = (opts = {}) => {
    if (incidents.length === 0) return originalListRepair(opts);
    const includeResolved = opts.includeResolved !== false;
    return incidents.filter((item) => includeResolved || item.recoveryState !== "resolved");
  };
  if (typeof database.listEvolutionCandidates === "function") {
    const originalEvolution = database.listEvolutionCandidates.bind(database);
    database.listEvolutionCandidates = (...args) => {
      if (evolution.length === 0) return originalEvolution(...args);
      return evolution;
    };
  } else {
    database.listEvolutionCandidates = () => evolution;
  }

  const ledger = new Map();
  const context = {
    database,
    manifest,
    supervisor,
    repositoryHeadReader: () => HEAD,
    now: () => "2026-09-07T02:00:00.000Z",
    actionLedger: ledger,
  };

  return { database, createdTasks, context, ledger, manifest, supervisor };
}

test("operationsSnapshot returns required bounded metadata fields with deterministic ordering", (t) => {
  const { context } = fixture(t, {
    workers: [
      { id: "z-worker", state: "live", capabilities: ["b.cap", "a.cap"] },
      { id: "a-worker", state: "busy", capabilities: ["system.health"] },
    ],
    tasks: [
      { idempotencyKey: "t-active-1" },
      { idempotencyKey: "t-fail-1", status: "failed" },
    ],
    objectives: [
      { id: "obj-2", status: "running" },
      { id: "obj-1", status: "planned" },
      { id: "obj-3", status: "waiting" },
    ],
    incidents: [{ id: "inc-1", recoveryState: "open" }],
    evolution: [{ id: "evo-1", state: "verified", headSha: HEAD }],
  });

  const first = operationsSnapshot(context);
  const second = operationsSnapshot(context);
  assert.equal(first.generatedAt, "2026-09-07T02:00:00.000Z");
  assert.equal(first.runtime.version, "7.0.0-alpha.2");
  assert.ok("productionBaseline" in first.runtime);
  assert.ok("rollbackTarget" in first.runtime);
  assert.equal(first.repository.headSha, HEAD);
  assert.equal(first.repository.cleanState, "verified");
  assert.deepEqual(first.workers.map((w) => w.id), ["a-worker", "z-worker"]);
  assert.deepEqual(first.workers[0].capabilities, ["system.health"]);
  assert.deepEqual(first.workers[1].capabilities, ["a.cap", "b.cap"]);
  assert.equal(typeof first.tasks.active, "number");
  assert.equal(typeof first.tasks.waiting, "number");
  assert.equal(typeof first.tasks.failed, "number");
  assert.equal(typeof first.objectives.active, "number");
  assert.equal(typeof first.objectives.waiting, "number");
  assert.equal(first.repairs.activeIncidents, 1);
  assert.ok(first.verification.state);
  assert.equal(first.verification.exactHeadSha, HEAD);
  assert.ok("candidate" in first.update);
  assert.ok("activationState" in first.update);
  assert.ok("rollbackReady" in first.update);
  assert.deepEqual(first, second);
  assertNoSensitiveKeys(first);
});

test("operationsSnapshot bounds list and count sizes", (t) => {
  const manyWorkers = Array.from({ length: 80 }, (_, index) => ({
    id: `worker-${String(index).padStart(3, "0")}`,
    state: "live",
    capabilities: Array.from({ length: 20 }, (__, cap) => `cap.${cap}`),
  }));
  const { context } = fixture(t, { workers: manyWorkers });
  const snapshot = operationsSnapshot(context);
  assert.ok(snapshot.workers.length <= 32);
  for (const worker of snapshot.workers) {
    assert.ok(worker.capabilities.length <= 16);
  }
  assert.ok(snapshot.tasks.active <= 10_000);
  assert.ok(snapshot.tasks.waiting <= 10_000);
  assert.ok(snapshot.tasks.failed <= 10_000);
});

test("operationsSnapshot recursively omits secret-like fields", (t) => {
  const { context } = fixture(t);
  assertNoSensitiveKeys(operationsSnapshot(context));
});

test("classifyOperationalTone ports pure operator-deck status semantics", () => {
  assert.equal(classifyOperationalTone("succeeded"), "ok");
  assert.equal(classifyOperationalTone("failed"), "danger");
  assert.equal(classifyOperationalTone("denied"), "danger");
  assert.equal(classifyOperationalTone("running"), "warn");
  assert.equal(classifyOperationalTone("leased"), "warn");
  assert.equal(classifyOperationalTone("waiting"), "steel");
  assert.equal(classifyOperationalTone("unknown"), "neutral");
});

test("executeOperationsAction rejects unknown action IDs", async (t) => {
  const { context } = fixture(t);
  await assert.rejects(
    () => executeOperationsAction({ actionId: "shell.exec", idempotencyKey: "k1" }, context),
    /operations-action-unknown/,
  );
});

test("executeOperationsAction requires an idempotency key for writes", async (t) => {
  const { context } = fixture(t);
  await assert.rejects(
    () => executeOperationsAction({ actionId: "runtime.health-check" }, context),
    /operations-idempotency-key-required/,
  );
});

test("executeOperationsAction rejects arbitrary command, shell, path, script, or executable input", async (t) => {
  const { context } = fixture(t);
  for (const bad of [
    { actionId: "runtime.health-check", idempotencyKey: "k", command: "rm -rf /" },
    { actionId: "runtime.health-check", idempotencyKey: "k", shell: "bash" },
    { actionId: "runtime.health-check", idempotencyKey: "k", path: "/etc/passwd" },
    { actionId: "runtime.health-check", idempotencyKey: "k", script: "evil.js" },
    { actionId: "runtime.health-check", idempotencyKey: "k", executable: "/bin/sh" },
    { actionId: "runtime.health-check", idempotencyKey: "k", ref: "refs/heads/main" },
    { actionId: "runtime.health-check", idempotencyKey: "k", url: "https://evil.example" },
  ]) {
    await assert.rejects(() => executeOperationsAction(bad, context), /operations-action-input-rejected/);
  }
});

test("executeOperationsAction returns a stable receipt and is idempotent for duplicate keys", async (t) => {
  const { context, ledger } = fixture(t);
  const input = { actionId: "runtime.health-check", idempotencyKey: "health-1" };
  const first = await executeOperationsAction(input, context);
  const second = await executeOperationsAction(input, context);
  assert.equal(first.ok, true);
  assert.equal(typeof first.receiptId, "string");
  assert.match(first.receiptId, /^ops-/);
  assert.equal(second.receiptId, first.receiptId);
  assert.deepEqual(second, first);
  assert.equal(ledger.size, 1);
  assertNoSensitiveKeys(first);
});

test("executeOperationsAction propagates confirmation-required rather than bypassing it", async (t) => {
  const { context, database } = fixture(t);
  const task = database.submitTask({
    capability: "system.health",
    dataClass: "synthetic",
    requestedMode: "local",
    requestedOutcome: "Cancel me",
    idempotencyKey: "cancel-target",
  });
  const pending = await executeOperationsAction({
    actionId: "task.cancel",
    idempotencyKey: "cancel-1",
    taskId: task.id,
  }, context);
  assert.equal(pending.confirmationRequired, true);
  assert.equal(pending.ok, false);
  assert.equal(database.getTask(task.id).status, "queued");
  assert.ok(pending.receiptId);

  const confirmed = await executeOperationsAction({
    actionId: "task.cancel",
    idempotencyKey: "cancel-1-confirm",
    taskId: task.id,
    confirmationToken: pending.confirmationToken,
  }, context);
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.confirmationRequired, false);
  assert.equal(database.getTask(task.id).status, "cancelled");
});

test("executeOperationsAction allowlist is exactly the stable Track A IDs", () => {
  assert.deepEqual([...OPERATIONS_ACTION_IDS].sort(), [
    "repair.request",
    "repository.verify",
    "runtime.health-check",
    "task.cancel",
    "task.retry",
  ]);
});

test("task.retry requires confirmation and then retries once per idempotency key", async (t) => {
  const { context, database } = fixture(t, { tasks: [{ idempotencyKey: "retry-source", status: "failed" }] });
  const failed = database.listTasks().find((task) => task.status === "failed");
  assert.ok(failed);
  const pending = await executeOperationsAction({
    actionId: "task.retry",
    idempotencyKey: "retry-1",
    taskId: failed.id,
  }, context);
  assert.equal(pending.confirmationRequired, true);
  const confirmed = await executeOperationsAction({
    actionId: "task.retry",
    idempotencyKey: "retry-1-confirm",
    taskId: failed.id,
    confirmationToken: pending.confirmationToken,
  }, context);
  assert.equal(confirmed.ok, true);
  const again = await executeOperationsAction({
    actionId: "task.retry",
    idempotencyKey: "retry-1-confirm",
    taskId: failed.id,
    confirmationToken: pending.confirmationToken,
  }, context);
  assert.equal(again.receiptId, confirmed.receiptId);
});

test("repair.request and repository.verify produce bounded receipts without secrets", async (t) => {
  const { context } = fixture(t, { incidents: [{ id: "inc-open", recoveryState: "open" }] });
  const repairPending = await executeOperationsAction({
    actionId: "repair.request",
    idempotencyKey: "repair-1",
    incidentId: "inc-open",
  }, context);
  assert.equal(repairPending.confirmationRequired, true);
  const repair = await executeOperationsAction({
    actionId: "repair.request",
    idempotencyKey: "repair-1-confirm",
    incidentId: "inc-open",
    confirmationToken: repairPending.confirmationToken,
  }, context);
  assert.equal(repair.ok, true);
  assertNoSensitiveKeys(repair);

  const verify = await executeOperationsAction({
    actionId: "repository.verify",
    idempotencyKey: "verify-1",
  }, context);
  assert.equal(verify.ok, true);
  assert.equal(verify.result?.exactHeadSha, HEAD);
  assertNoSensitiveKeys(verify);
});
