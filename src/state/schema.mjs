import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const VALID_NODES = new Set(["Propose", "Challenge", "Synthesis", "Implementation", "Verification", "Integration", "Note"]);
const PRIVATE_REASONING_KEYS = new Set([
  "thought",
  "thoughtpayload",
  "chainofthought",
  "currentthoughtchain",
  "rawreasoning",
  "reasoningtrace",
]);
const MAX_SUMMARY_BYTES = 64 * 1024;

export function openUccpStateStore({ file, now = () => Date.now() } = {}) {
  if (typeof file !== "string" || !file.trim()) throw new TypeError("uccp-state-file-required");
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = FULL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS uccp_task_leases (
      lease_id TEXT PRIMARY KEY NOT NULL,
      correlation_id TEXT NOT NULL,
      worker_name TEXT NOT NULL,
      current_node TEXT NOT NULL CHECK(current_node IN ('Propose','Challenge','Synthesis','Implementation','Verification','Integration','Note')),
      decision_summary_json TEXT NOT NULL,
      lease_duration_ms INTEGER NOT NULL CHECK(lease_duration_ms >= 1000 AND lease_duration_ms <= 3600000),
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_uccp_correlation ON uccp_task_leases(correlation_id);
    CREATE INDEX IF NOT EXISTS idx_uccp_worker ON uccp_task_leases(worker_name);
    CREATE INDEX IF NOT EXISTS idx_uccp_expiry ON uccp_task_leases(expires_at);
  `);

  const insertLease = db.prepare(`
    INSERT INTO uccp_task_leases (
      lease_id, correlation_id, worker_name, current_node, decision_summary_json,
      lease_duration_ms, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(lease_id) DO UPDATE SET
      correlation_id = excluded.correlation_id,
      worker_name = excluded.worker_name,
      current_node = excluded.current_node,
      decision_summary_json = excluded.decision_summary_json,
      lease_duration_ms = excluded.lease_duration_ms,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `);
  const latestLeaseStatement = db.prepare("SELECT * FROM uccp_task_leases ORDER BY updated_at DESC, created_at DESC LIMIT 1");
  const activeLeaseStatement = db.prepare("SELECT * FROM uccp_task_leases WHERE expires_at > ? ORDER BY updated_at DESC, created_at DESC");

  let closed = false;
  const assertOpen = () => {
    if (closed) throw new Error("uccp-state-store-closed");
  };

  return Object.freeze({
    recordLease({
      leaseId = randomUUID(), correlationId, workerName, currentNode = "Note",
      decisionSummary, metrics = null, leaseDurationMs = 60_000, createdAt = now(), updatedAt = createdAt,
    } = {}) {
      assertOpen();
      requiredText(leaseId, "uccp-lease-id-required");
      requiredText(correlationId, "uccp-correlation-id-required");
      requiredText(workerName, "uccp-worker-name-required");
      if (!VALID_NODES.has(currentNode)) throw new TypeError("uccp-current-node-invalid");
      if (!Number.isInteger(leaseDurationMs) || leaseDurationMs < 1_000 || leaseDurationMs > 3_600_000) throw new TypeError("uccp-lease-duration-invalid");
      if (!Number.isInteger(createdAt) || !Number.isInteger(updatedAt)) throw new TypeError("uccp-timestamp-invalid");
      assertBoundedSummary(decisionSummary);
      if (metrics !== null) assertNoPrivateReasoning(metrics);
      const payload = JSON.stringify({ decisionSummary, metrics });
      if (Buffer.byteLength(payload, "utf8") > MAX_SUMMARY_BYTES) throw new TypeError("uccp-decision-summary-too-large");
      const expiresAt = updatedAt + leaseDurationMs;
      insertLease.run(leaseId, correlationId, workerName, currentNode, payload, leaseDurationMs, expiresAt, createdAt, updatedAt);
      return normalizeLease({
        lease_id: leaseId, correlation_id: correlationId, worker_name: workerName, current_node: currentNode,
        decision_summary_json: payload, lease_duration_ms: leaseDurationMs, expires_at: expiresAt,
        created_at: createdAt, updated_at: updatedAt,
      });
    },

    latestLease() {
      assertOpen();
      const row = latestLeaseStatement.get();
      return row ? normalizeLease(row) : null;
    },

    listActiveLeases(at = now()) {
      assertOpen();
      if (!Number.isInteger(at)) throw new TypeError("uccp-active-lease-time-invalid");
      return activeLeaseStatement.all(at).map(normalizeLease);
    },

    health() {
      assertOpen();
      const journal = db.prepare("PRAGMA journal_mode").get();
      const integrity = db.prepare("PRAGMA quick_check").get();
      return {
        journalMode: String(journal?.journal_mode ?? "unknown").toLowerCase(),
        integrity: String(integrity?.quick_check ?? "unknown").toLowerCase(),
        latestLeaseUpdatedAt: latestLeaseStatement.get()?.updated_at ?? null,
      };
    },

    close() {
      if (closed) return;
      closed = true;
      db.close();
    },
  });
}

function normalizeLease(row) {
  const payload = JSON.parse(row.decision_summary_json);
  return {
    leaseId: row.lease_id,
    correlationId: row.correlation_id,
    workerName: row.worker_name,
    currentNode: row.current_node,
    decisionSummary: payload.decisionSummary,
    metrics: payload.metrics,
    leaseDurationMs: Number(row.lease_duration_ms),
    expiresAt: Number(row.expires_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function assertBoundedSummary(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("uccp-decision-summary-required");
  assertNoPrivateReasoning(value);
}

function assertNoPrivateReasoning(value, seen = new Set()) {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) throw new TypeError("uccp-decision-summary-cyclic");
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (PRIVATE_REASONING_KEYS.has(normalized)) throw new TypeError("uccp-private-reasoning-field-forbidden");
    assertNoPrivateReasoning(nested, seen);
  }
  seen.delete(value);
}

function requiredText(value, code) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(code);
}