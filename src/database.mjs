import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const TASK_STATES = new Set(["queued", "claimed", "running", "verifying", "waiting", "waiting_for_user", "completed", "failed", "cancelled"]);
const PRIORITIES = new Set(["critical", "high", "normal", "low", "background"]);
const IMPROVEMENT_STATES = new Set(["proposed", "approved", "rejected", "activated"]);

export class RuntimeDatabase {
  constructor(file) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    this.#migrate();
  }

  close() { this.db.close(); }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE NOT NULL,
        capability TEXT NOT NULL,
        data_class TEXT NOT NULL,
        requested_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        assigned_worker TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        lease_expires_at TEXT,
        result_summary TEXT,
        error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        event_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        metadata_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS improvements (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        status TEXT NOT NULL,
        test_summary TEXT,
        created_at TEXT NOT NULL,
        decided_at TEXT,
        activated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS worker_state (
        worker_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        pid INTEGER,
        restart_count INTEGER NOT NULL DEFAULT 0,
        last_heartbeat_at TEXT,
        last_error_code TEXT
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        current_task_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        task_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        requires_response INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_events_subject ON events(subject_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON conversation_messages(conversation_id, created_at);
    `);
    this.#ensureTaskColumns();
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(status, priority, created_at);");
  }

  #ensureTaskColumns() {
    const current = new Set(this.db.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name));
    const additions = [
      ["correlation_id", "TEXT"], ["task_type", "TEXT"], ["requested_outcome", "TEXT"],
      ["execution_plane", "TEXT NOT NULL DEFAULT 'local'"], ["priority", "TEXT NOT NULL DEFAULT 'normal'"],
      ["maximum_attempts", "INTEGER NOT NULL DEFAULT 3"], ["checkpoint", "TEXT"], ["verifier", "TEXT"],
      ["conversation_id", "TEXT"],
    ];
    for (const [name, definition] of additions) if (!current.has(name)) this.db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${definition}`);
  }

  submitTask({ capability, dataClass, requestedMode = "local", idempotencyKey = randomUUID(), correlationId = idempotencyKey,
    taskType = capability.split(".")[0], requestedOutcome = capability, executionPlane = "local", priority = "normal", maximumAttempts = 3,
    conversationId = null }) {
    validateCapability(capability);
    validateDataClass(dataClass);
    bounded(requestedMode, 30, "requested mode");
    bounded(idempotencyKey, 120, "idempotency key");
    bounded(correlationId, 120, "correlation id"); bounded(taskType, 64, "task type");
    bounded(requestedOutcome, 1000, "requested outcome"); bounded(executionPlane, 40, "execution plane");
    if (!PRIORITIES.has(priority)) throw new TypeError("Task priority is invalid.");
    if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1 || maximumAttempts > 20) throw new TypeError("Maximum attempts is invalid.");
    if (conversationId !== null) { bounded(conversationId, 80, "conversation id"); if (!this.getConversation(conversationId)) throw new TypeError("Conversation is missing."); }
    const existing = this.db.prepare("SELECT * FROM tasks WHERE idempotency_key = ?").get(idempotencyKey);
    if (existing) return normalizeTask(existing);
    const id = `mhg-${randomUUID()}`;
    const now = new Date().toISOString();
    const transaction = () => this.#transaction(() => {
      this.db.prepare(`INSERT INTO tasks
        (id, idempotency_key, correlation_id, task_type, requested_outcome, capability, data_class, requested_mode,
         execution_plane, priority, maximum_attempts, conversation_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`)
        .run(id, idempotencyKey, correlationId, taskType, requestedOutcome, capability, dataClass, requestedMode,
          executionPlane, priority, maximumAttempts, conversationId, now, now);
      this.#event("task.submitted", id, { correlationId, taskType, capability, dataClass, requestedMode, executionPlane, priority });
    });
    transaction();
    return this.getTask(id);
  }

  createConversation({ title, initialMessage = null }) {
    bounded(title, 200, "conversation title");
    if (initialMessage !== null) boundedMultiline(initialMessage, 12000, "initial message");
    const id = `con-${randomUUID()}`; const now = new Date().toISOString();
    this.#transaction(() => {
      this.db.prepare("INSERT INTO conversations(id,title,status,created_at,updated_at) VALUES(?,?,'active',?,?)").run(id, title, now, now);
      this.#event("conversation.created", id, { title });
      if (initialMessage) this.#addMessage({ conversationId: id, role: "user", content: initialMessage, createdAt: now });
    });
    return this.getConversation(id);
  }

  getConversation(id) {
    bounded(id, 80, "conversation id");
    const row = this.db.prepare("SELECT * FROM conversations WHERE id=?").get(id);
    return row ? normalizeConversation(row) : null;
  }

  listConversations(limit = 100) {
    const size = Math.max(1, Math.min(Number(limit) || 100, 500));
    return this.db.prepare("SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?").all(size).map(normalizeConversation);
  }

  addConversationMessage({ conversationId, taskId = null, role = "user", content, requiresResponse = false }) {
    bounded(conversationId, 80, "conversation id");
    if (taskId !== null) bounded(taskId, 80, "task id");
    if (!new Set(["user", "assistant", "system", "worker"]).has(role)) throw new TypeError("Conversation role is invalid.");
    boundedMultiline(content, 12000, "conversation message");
    if (!this.getConversation(conversationId)) throw new TypeError("Conversation is missing.");
    const message = this.#addMessage({ conversationId, taskId, role, content, requiresResponse });
    this.#event("conversation.message", conversationId, { messageId: message.id, taskId, role, requiresResponse });
    return message;
  }

  #addMessage({ conversationId, taskId = null, role, content, requiresResponse = false, createdAt = new Date().toISOString() }) {
    const id = `msg-${randomUUID()}`;
    this.db.prepare(`INSERT INTO conversation_messages(id,conversation_id,task_id,role,content,requires_response,created_at)
      VALUES(?,?,?,?,?,?,?)`).run(id, conversationId, taskId, role, content, requiresResponse ? 1 : 0, createdAt);
    this.db.prepare("UPDATE conversations SET updated_at=? WHERE id=?").run(createdAt, conversationId);
    return { id, conversationId, taskId, role, content, requiresResponse: Boolean(requiresResponse), createdAt };
  }

  listConversationMessages(conversationId, limit = 500) {
    bounded(conversationId, 80, "conversation id");
    const size = Math.max(1, Math.min(Number(limit) || 500, 1000));
    return this.db.prepare("SELECT * FROM conversation_messages WHERE conversation_id=? ORDER BY created_at, id LIMIT ?")
      .all(conversationId, size).map(normalizeMessage);
  }

  waitTaskForUser(id, prompt) {
    boundedMultiline(prompt, 4000, "waiting prompt");
    const task = this.getTask(id);
    if (!task) return null;
    const now = new Date().toISOString();
    const changed = this.db.prepare(`UPDATE tasks SET status='waiting_for_user', lease_expires_at=NULL, updated_at=?
      WHERE id=? AND status IN ('running','verifying')`).run(now, id);
    if (changed.changes === 1) {
      if (task.conversationId) this.addConversationMessage({ conversationId: task.conversationId, taskId: id, role: "worker", content: prompt, requiresResponse: true });
      this.#event("task.waiting_for_user", id, { conversationId: task.conversationId });
    }
    return this.getTask(id);
  }

  resumeTaskWithInput(id, content) {
    boundedMultiline(content, 12000, "task input");
    const task = this.getTask(id);
    if (!task || task.status !== "waiting_for_user") return task;
    if (task.conversationId) this.addConversationMessage({ conversationId: task.conversationId, taskId: id, role: "user", content });
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE tasks SET status='queued', assigned_worker=NULL, updated_at=?, error_code=NULL WHERE id=? AND status='waiting_for_user'`).run(now, id);
    this.#event("task.resumed_from_user", id, { conversationId: task.conversationId });
    return this.getTask(id);
  }

  getTask(id) {
    bounded(id, 80, "task id");
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    return row ? normalizeTask(row) : null;
  }

  listTasks(limit = 100) {
    const size = Math.max(1, Math.min(Number(limit) || 100, 500));
    return this.db.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?").all(size).map(normalizeTask);
  }

  listEvents(limit = 200) {
    const size = Math.max(1, Math.min(Number(limit) || 200, 1000));
    return this.db.prepare("SELECT * FROM events ORDER BY sequence DESC LIMIT ?").all(size).map((row) => ({
      sequence: row.sequence, timestamp: row.timestamp, eventType: row.event_type, subjectId: row.subject_id,
      metadata: JSON.parse(row.metadata_json),
    }));
  }

  claimNext({ workerId, capabilities, leaseMs }) {
    bounded(workerId, 64, "worker id");
    if (!Array.isArray(capabilities) || capabilities.length === 0) return null;
    capabilities.forEach(validateCapability);
    const placeholders = capabilities.map(() => "?").join(",");
    const transaction = () => this.#transaction(() => {
      const row = this.db.prepare(`SELECT * FROM tasks WHERE status = 'queued' AND attempt_count < maximum_attempts
        AND capability IN (${placeholders}) ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1
        WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, created_at LIMIT 1`).get(...capabilities);
      if (!row) return null;
      const now = new Date();
      const lease = new Date(now.getTime() + leaseMs).toISOString();
      const changed = this.db.prepare(`UPDATE tasks SET status='running', assigned_worker=?, attempt_count=attempt_count+1,
        lease_expires_at=?, updated_at=? WHERE id=? AND status='queued'`).run(workerId, lease, now.toISOString(), row.id);
      if (changed.changes !== 1) return null;
      this.#event("task.claimed", row.id, { workerId, leaseExpiresAt: lease });
      return this.getTask(row.id);
    });
    return transaction();
  }

  markVerifying(id, verifier = "worker-result") {
    bounded(verifier, 80, "verifier");
    const now = new Date().toISOString();
    const changed = this.db.prepare("UPDATE tasks SET status='verifying', verifier=?, updated_at=? WHERE id=? AND status='running'")
      .run(verifier, now, id);
    if (changed.changes === 1) this.#event("task.verifying", id, { verifier });
    return this.getTask(id);
  }

  finishTask(id, { status, resultSummary = null, errorCode = null }) {
    if (!new Set(["completed", "failed", "waiting", "cancelled"]).has(status)) throw new TypeError("Terminal task status is invalid.");
    if (resultSummary !== null) bounded(resultSummary, 2000, "result summary");
    if (errorCode !== null) bounded(errorCode, 80, "error code");
    const now = new Date().toISOString();
    const changed = this.db.prepare(`UPDATE tasks SET status=?, result_summary=?, error_code=?, lease_expires_at=NULL, updated_at=?
      WHERE id=? AND status IN ('running','verifying')`).run(status, resultSummary, errorCode, now, id);
    if (changed.changes === 1) this.#event(`task.${status}`, id, { errorCode });
    return this.getTask(id);
  }

  recoverExpired(now = new Date()) {
    const expired = this.db.prepare("SELECT id, assigned_worker FROM tasks WHERE status IN ('running','verifying') AND lease_expires_at < ?").all(now.toISOString());
    const transaction = () => this.#transaction(() => {
      for (const row of expired) {
        this.db.prepare(`UPDATE tasks SET status='queued', assigned_worker=NULL, lease_expires_at=NULL,
          error_code='lease-expired', updated_at=? WHERE id=? AND status IN ('running','verifying')`).run(now.toISOString(), row.id);
        this.#event("task.recovered", row.id, { previousWorker: row.assigned_worker });
      }
    });
    transaction();
    return expired.length;
  }

  recoverWorkerTasks(workerId, reason = "worker-exited") {
    bounded(workerId, 64, "worker id"); bounded(reason, 80, "recovery reason");
    const rows = this.db.prepare("SELECT id, attempt_count, maximum_attempts FROM tasks WHERE assigned_worker=? AND status IN ('running','verifying')").all(workerId);
    this.#transaction(() => {
      for (const row of rows) {
        const exhausted = row.attempt_count >= row.maximum_attempts;
        this.db.prepare(`UPDATE tasks SET status=?, assigned_worker=NULL, lease_expires_at=NULL, error_code=?, updated_at=?
          WHERE id=? AND status IN ('running','verifying')`).run(exhausted ? "failed" : "queued", reason, new Date().toISOString(), row.id);
        this.#event(exhausted ? "task.failed" : "task.recovered", row.id, { previousWorker: workerId, reason });
      }
    });
    return rows.length;
  }

  setWorkerState({ workerId, status, pid = null, restartCount = 0, lastHeartbeatAt = null, lastErrorCode = null }) {
    bounded(workerId, 64, "worker id"); bounded(status, 30, "worker status");
    this.db.prepare(`INSERT INTO worker_state(worker_id,status,pid,restart_count,last_heartbeat_at,last_error_code)
      VALUES(?,?,?,?,?,?) ON CONFLICT(worker_id) DO UPDATE SET status=excluded.status,pid=excluded.pid,
      restart_count=excluded.restart_count,last_heartbeat_at=excluded.last_heartbeat_at,last_error_code=excluded.last_error_code`)
      .run(workerId, status, pid, restartCount, lastHeartbeatAt, lastErrorCode);
  }

  listWorkerState() { return this.db.prepare("SELECT * FROM worker_state ORDER BY worker_id").all().map((row) => ({
    workerId: row.worker_id, status: row.status, pid: row.pid, restartCount: row.restart_count,
    lastHeartbeatAt: row.last_heartbeat_at, lastErrorCode: row.last_error_code,
  })); }

  proposeImprovement({ title, summary, testSummary = null }) {
    bounded(title, 160, "improvement title"); bounded(summary, 4000, "improvement summary");
    if (testSummary !== null) bounded(testSummary, 2000, "test summary");
    const id = `imp-${randomUUID()}`; const now = new Date().toISOString();
    this.db.prepare("INSERT INTO improvements(id,title,summary,status,test_summary,created_at) VALUES(?,?,?,'proposed',?,?)")
      .run(id, title, summary, testSummary, now);
    this.#event("improvement.proposed", id, { title });
    return this.getImprovement(id);
  }

  getImprovement(id) { const row = this.db.prepare("SELECT * FROM improvements WHERE id=?").get(id); return row ? normalizeImprovement(row) : null; }
  listImprovements() { return this.db.prepare("SELECT * FROM improvements ORDER BY created_at DESC LIMIT 200").all().map(normalizeImprovement); }

  decideImprovement(id, decision) {
    if (!new Set(["approved", "rejected"]).has(decision)) throw new TypeError("Improvement decision is invalid.");
    const current = this.getImprovement(id);
    if (!current || current.status !== "proposed") return current;
    const now = new Date().toISOString();
    this.db.prepare("UPDATE improvements SET status=?, decided_at=? WHERE id=? AND status='proposed'").run(decision, now, id);
    this.#event(`improvement.${decision}`, id, {});
    return this.getImprovement(id);
  }

  #event(type, subjectId, metadata) {
    this.db.prepare("INSERT INTO events(timestamp,event_type,subject_id,metadata_json) VALUES(?,?,?,?)")
      .run(new Date().toISOString(), type, subjectId, JSON.stringify(metadata));
  }

  #transaction(callback) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

function normalizeTask(row) { if (!TASK_STATES.has(row.status)) throw new Error("Stored task status is invalid."); return {
  id: row.id, idempotencyKey: row.idempotency_key, correlationId: row.correlation_id, taskType: row.task_type,
  requestedOutcome: row.requested_outcome, capability: row.capability, dataClass: row.data_class,
  requestedMode: row.requested_mode, status: row.status, assignedWorker: row.assigned_worker,
  attemptCount: row.attempt_count, leaseExpiresAt: row.lease_expires_at, resultSummary: row.result_summary,
  errorCode: row.error_code, executionPlane: row.execution_plane, priority: row.priority,
  maximumAttempts: row.maximum_attempts, checkpoint: row.checkpoint, verifier: row.verifier,
  conversationId: row.conversation_id,
  createdAt: row.created_at, updatedAt: row.updated_at,
}; }
function normalizeConversation(row) { return { id: row.id, title: row.title, status: row.status, currentTaskId: row.current_task_id, createdAt: row.created_at, updatedAt: row.updated_at }; }
function normalizeMessage(row) { return { id: row.id, conversationId: row.conversation_id, taskId: row.task_id, role: row.role, content: row.content, requiresResponse: Boolean(row.requires_response), createdAt: row.created_at }; }
function normalizeImprovement(row) { if (!IMPROVEMENT_STATES.has(row.status)) throw new Error("Stored improvement status is invalid."); return {
  id: row.id, title: row.title, summary: row.summary, status: row.status, testSummary: row.test_summary,
  createdAt: row.created_at, decidedAt: row.decided_at, activatedAt: row.activated_at,
}; }
function validateCapability(value) { if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,31}\.[a-z][a-z0-9-]{0,31}$/.test(value)) throw new TypeError("Capability is invalid."); }
function validateDataClass(value) { if (!new Set(["synthetic", "personal", "enterprise", "local-only"]).has(value)) throw new TypeError("Data class is invalid."); }
function bounded(value, max, name) { if (typeof value !== "string" || value.length < 1 || value.length > max || /[\r\n]/.test(value)) throw new TypeError(`${name} is invalid.`); }
function boundedMultiline(value, max, name) { if (typeof value !== "string" || value.trim().length < 1 || value.length > max || /\u0000/.test(value)) throw new TypeError(`${name} is invalid.`); }
