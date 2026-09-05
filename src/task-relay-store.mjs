import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  RELAY_PROTOCOL_VERSION,
  cancelTask,
  completeTask,
  failTask,
  leaseTask,
  renewLease,
  submitTask,
  taskStatus,
  validateRelayTask,
} from "./task-relay-contract.mjs";

export class TaskRelayStore {
  constructor(file) {
    if (typeof file !== "string" || file.length < 1) throw new TypeError("relay-store-file-invalid");
    mkdirSync(path.dirname(file), { recursive: true });
    this.file = file;
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS relay_tasks (
        task_id TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE NOT NULL,
        request_hash TEXT NOT NULL,
        fencing_token INTEGER NOT NULL,
        status TEXT NOT NULL,
        task_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS relay_tasks_status ON relay_tasks(status, fencing_token);
    `);
  }

  close() {
    this.db.close();
  }

  submit(input, { now = new Date().toISOString() } = {}) {
    return this.#transaction(() => {
      const existing = this.#all();
      const result = submitTask(existing, input, { now });
      if (result.created) this.#insert(result.task);
      return result;
    });
  }

  lease(taskId, input, { now = new Date().toISOString() } = {}) {
    return this.#write(taskId, (task) => leaseTask(task, input, { now }));
  }

  leaseQueued(input, { now = new Date().toISOString() } = {}) {
    return this.#transaction(() => {
      const queued = this.#all().filter((task) => task.status === "queued" || (task.status === "leased" && Date.parse(task.lease.expiresAt) <= Date.parse(now)));
      if (queued.length < 1) return null;
      const next = queued.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.taskId.localeCompare(right.taskId))[0];
      const leased = leaseTask(next, input, { now });
      this.#replace(next, leased);
      return leased;
    });
  }

  renew(taskId, input, { now = new Date().toISOString() } = {}) {
    return this.#write(taskId, (task) => renewLease(task, input, { now }));
  }

  complete(taskId, input, { now = new Date().toISOString() } = {}) {
    return this.#write(taskId, (task) => completeTask(task, input, { now }));
  }

  fail(taskId, input, { now = new Date().toISOString() } = {}) {
    return this.#write(taskId, (task) => failTask(task, input, { now }));
  }

  cancel(taskId, input, { now = new Date().toISOString() } = {}) {
    return this.#write(taskId, (task) => cancelTask(task, input, { now }));
  }

  status(taskId, { now = new Date().toISOString() } = {}) {
    return taskStatus(this.#load(taskId), { now });
  }

  get(taskId) {
    return this.#load(taskId);
  }

  getByIdempotencyKey(idempotencyKey) {
    const row = this.db.prepare("SELECT task_json FROM relay_tasks WHERE idempotency_key = ?").get(idempotencyKey);
    return row ? validateRelayTask(JSON.parse(row.task_json)) : null;
  }

  protocolVersion() {
    return RELAY_PROTOCOL_VERSION;
  }

  #write(taskId, mutate) {
    return this.#transaction(() => {
      const current = this.#load(taskId);
      const next = mutate(current);
      this.#replace(current, next);
      return next;
    });
  }

  #insert(task) {
    const record = validateRelayTask(task);
    this.db.prepare(`
      INSERT INTO relay_tasks (task_id, idempotency_key, request_hash, fencing_token, status, task_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(record.taskId, record.idempotencyKey, record.requestHash, record.fencingToken, record.status, JSON.stringify(record), record.updatedAt);
  }

  #replace(current, next) {
    const record = validateRelayTask(next);
    const result = this.db.prepare(`
      UPDATE relay_tasks
      SET request_hash = ?, fencing_token = ?, status = ?, task_json = ?, updated_at = ?
      WHERE task_id = ? AND fencing_token = ? AND status = ?
    `).run(
      record.requestHash, record.fencingToken, record.status, JSON.stringify(record), record.updatedAt,
      current.taskId, current.fencingToken, current.status,
    );
    if (result.changes !== 1) throw new TypeError("relay-store-contention");
  }

  #load(taskId) {
    const row = this.db.prepare("SELECT task_json FROM relay_tasks WHERE task_id = ?").get(taskId);
    if (!row) throw new TypeError("relay-store-task-missing");
    return validateRelayTask(JSON.parse(row.task_json));
  }

  #all() {
    return this.db.prepare("SELECT task_json FROM relay_tasks ORDER BY updated_at ASC").all()
      .map((row) => validateRelayTask(JSON.parse(row.task_json)));
  }

  #transaction(work) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
