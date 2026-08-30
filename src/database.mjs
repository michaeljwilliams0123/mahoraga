import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { MAX_INTEGRATION_LEASE_MS, PRIMARY_CONTROLLERS, overlappingPaths } from "./controller-authority.mjs";

const TASK_STATES = new Set(["queued", "claimed", "running", "verifying", "waiting", "waiting_for_user", "completed", "failed", "cancelled"]);
const PRIORITIES = new Set(["critical", "high", "normal", "low", "background"]);
const IMPROVEMENT_STATES = new Set(["proposed", "approved", "rejected", "activated"]);
const ANSWER_EVALUATION_STATES = new Set(["accepted", "retry", "reroute", "unresolved"]);

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
        last_error_code TEXT,
        last_error_detail TEXT
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
      CREATE TABLE IF NOT EXISTS conversation_message_attachments (
        message_id TEXT NOT NULL,
        artifact_id TEXT NOT NULL,
        name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(message_id, artifact_id),
        FOREIGN KEY(message_id) REFERENCES conversation_messages(id)
      );
      CREATE TABLE IF NOT EXISTS execution_receipts (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        verifier TEXT NOT NULL,
        summary TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS answer_evaluations (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        evaluator_version TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason_codes_json TEXT NOT NULL,
        summary_sha256 TEXT NOT NULL,
        criteria_sha256 TEXT NOT NULL,
        summary_word_count INTEGER NOT NULL,
        criterion_token_count INTEGER NOT NULL,
        matched_criterion_count INTEGER NOT NULL,
        provider_verified INTEGER NOT NULL,
        declared_evidence_count INTEGER NOT NULL,
        acknowledgement_detected INTEGER NOT NULL,
        vague_detected INTEGER NOT NULL,
        contradiction_detected INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(task_id, attempt_number), FOREIGN KEY(task_id) REFERENCES tasks(id)
      );
      CREATE TABLE IF NOT EXISTS codex_builder_sessions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL UNIQUE,
        correlation_id TEXT NOT NULL,
        authority_session_id TEXT,
        execution_session_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS secondary_assignments (
        id TEXT PRIMARY KEY,
        correlation_id TEXT NOT NULL,
        title TEXT NOT NULL,
        task_area TEXT NOT NULL,
        expected_task TEXT NOT NULL,
        expected_base_commit TEXT NOT NULL,
        return_branch TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        return_commit TEXT,
        validation_task_id TEXT,
        verification_state TEXT,
        last_observation TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS objectives (
        id TEXT PRIMARY KEY,
        correlation_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        maximum_replans INTEGER NOT NULL,
        replan_count INTEGER NOT NULL DEFAULT 0,
        summary TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS objective_tasks (
        id TEXT PRIMARY KEY,
        objective_id TEXT NOT NULL,
        task_area TEXT NOT NULL,
        task_json TEXT NOT NULL,
        status TEXT NOT NULL,
        task_id TEXT,
        replan_count INTEGER NOT NULL DEFAULT 0,
        last_worker_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(objective_id) REFERENCES objectives(id)
      );
      CREATE TABLE IF NOT EXISTS controller_integration_lease (
        lease_id TEXT PRIMARY KEY,
        controller_id TEXT NOT NULL,
        purpose TEXT NOT NULL,
        paths_json TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        CHECK(controller_id IN ('primary-local-codex','primary-cloud-codex'))
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_events_subject ON events(subject_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON conversation_messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_message_attachments_artifact ON conversation_message_attachments(artifact_id);
      CREATE INDEX IF NOT EXISTS idx_receipts_task ON execution_receipts(task_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_answer_evaluations_task ON answer_evaluations(task_id, attempt_number);
      CREATE INDEX IF NOT EXISTS idx_builder_sessions_correlation ON codex_builder_sessions(correlation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_secondary_assignments_status ON secondary_assignments(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_objective_tasks_objective ON objective_tasks(objective_id, status);
    `);
    this.#ensureTaskColumns();
    this.#ensureReceiptColumns();
    this.#ensureSecondaryAssignmentColumns();
    this.#ensureWorkerStateColumns();
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(status, priority, created_at);");
  }

  #ensureTaskColumns() {
    const current = new Set(this.db.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name));
    const additions = [
      ["correlation_id", "TEXT"], ["task_type", "TEXT"], ["requested_outcome", "TEXT"],
      ["execution_plane", "TEXT NOT NULL DEFAULT 'local'"], ["priority", "TEXT NOT NULL DEFAULT 'normal'"],
      ["maximum_attempts", "INTEGER NOT NULL DEFAULT 3"], ["checkpoint", "TEXT"], ["verifier", "TEXT"],
      ["conversation_id", "TEXT"],
      ["task_area", "TEXT"], ["excluded_worker_ids", "TEXT NOT NULL DEFAULT '[]'"],
      ["completion_criteria", "TEXT NOT NULL DEFAULT 'worker-verified'"],
    ];
    for (const [name, definition] of additions) if (!current.has(name)) this.db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${definition}`);
  }

  #ensureReceiptColumns() {
    const current = new Set(this.db.prepare("PRAGMA table_info(execution_receipts)").all().map((column) => column.name));
    if (!current.has("metadata_json")) this.db.exec("ALTER TABLE execution_receipts ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'");
  }

  #ensureSecondaryAssignmentColumns() {
    const current = new Set(this.db.prepare("PRAGMA table_info(secondary_assignments)").all().map((column) => column.name));
    if (!current.has("allowed_paths_json")) this.db.exec("ALTER TABLE secondary_assignments ADD COLUMN allowed_paths_json TEXT NOT NULL DEFAULT '[]'");
    if (!current.has("source")) this.db.exec("ALTER TABLE secondary_assignments ADD COLUMN source TEXT NOT NULL DEFAULT 'runtime-api'");
  }

  #ensureWorkerStateColumns() {
    const current = new Set(this.db.prepare("PRAGMA table_info(worker_state)").all().map((column) => column.name));
    if (!current.has("last_error_detail")) this.db.exec("ALTER TABLE worker_state ADD COLUMN last_error_detail TEXT");
  }

  submitTask({ capability, dataClass, requestedMode = "local", idempotencyKey = randomUUID(), correlationId = idempotencyKey,
    taskType = capability.split(".")[0], requestedOutcome = capability, executionPlane = "local", priority = "normal", maximumAttempts = 3,
    conversationId = null, taskArea = "general", excludedWorkerIds = [],
    completionCriteria = capability === "assistant.respond" ? "substantive-response" : "worker-verified" }) {
    validateCapability(capability);
    validateDataClass(dataClass);
    bounded(requestedMode, 30, "requested mode");
    bounded(idempotencyKey, 120, "idempotency key");
    bounded(correlationId, 120, "correlation id"); bounded(taskType, 64, "task type");
    bounded(requestedOutcome, 1000, "requested outcome"); bounded(executionPlane, 40, "execution plane");
    bounded(completionCriteria, 400, "completion criteria");
    if (!PRIORITIES.has(priority)) throw new TypeError("Task priority is invalid.");
    if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1 || maximumAttempts > 20) throw new TypeError("Maximum attempts is invalid.");
    slug(taskArea, "task area");
    if (!Array.isArray(excludedWorkerIds) || excludedWorkerIds.length > 16) throw new TypeError("Excluded worker IDs are invalid.");
    excludedWorkerIds.forEach((item) => slug(item, "excluded worker id"));
    if (conversationId !== null) { bounded(conversationId, 80, "conversation id"); if (!this.getConversation(conversationId)) throw new TypeError("Conversation is missing."); }
    const id = `mhg-${randomUUID()}`;
    const now = new Date().toISOString();
    return this.#transaction(() => {
      const existing = this.db.prepare("SELECT * FROM tasks WHERE idempotency_key = ?").get(idempotencyKey);
      if (existing) {
        const task = normalizeTask(existing);
        assertIdempotentTaskRequest(task, {
          correlationId, taskType, requestedOutcome, capability, dataClass, requestedMode,
          executionPlane, priority, maximumAttempts, conversationId, taskArea, excludedWorkerIds, completionCriteria,
        });
        return task;
      }
      this.db.prepare(`INSERT INTO tasks
        (id, idempotency_key, correlation_id, task_type, requested_outcome, capability, data_class, requested_mode,
         execution_plane, priority, maximum_attempts, conversation_id, task_area, excluded_worker_ids, completion_criteria, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`)
        .run(id, idempotencyKey, correlationId, taskType, requestedOutcome, capability, dataClass, requestedMode,
          executionPlane, priority, maximumAttempts, conversationId, taskArea, JSON.stringify(excludedWorkerIds), completionCriteria, now, now);
      this.#event("task.submitted", id, { correlationId, taskType, capability, dataClass, requestedMode, executionPlane, priority });
      return this.getTask(id);
    });
  }

  createConversation({ title, initialMessage = null, attachments = [] }) {
    bounded(title, 200, "conversation title");
    if (initialMessage !== null) boundedMultiline(initialMessage, 12000, "initial message");
    const normalizedAttachments = conversationAttachments(attachments);
    if (!initialMessage && normalizedAttachments.length === 0) throw new TypeError("Initial message or attachment is required.");
    const id = `con-${randomUUID()}`; const now = new Date().toISOString();
    this.#transaction(() => {
      this.db.prepare("INSERT INTO conversations(id,title,status,created_at,updated_at) VALUES(?,?,'active',?,?)").run(id, title, now, now);
      this.#event("conversation.created", id, { title });
      if (initialMessage || normalizedAttachments.length) this.#addMessage({ conversationId: id, role: "user", content: initialMessage || "Attached file", attachments: normalizedAttachments, createdAt: now });
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

  addConversationMessage({ conversationId, taskId = null, role = "user", content, attachments = [], requiresResponse = false }) {
    bounded(conversationId, 80, "conversation id");
    if (taskId !== null) bounded(taskId, 80, "task id");
    if (!new Set(["user", "assistant", "system", "worker"]).has(role)) throw new TypeError("Conversation role is invalid.");
    boundedMultiline(content, 12000, "conversation message");
    const normalizedAttachments = conversationAttachments(attachments);
    if (!this.getConversation(conversationId)) throw new TypeError("Conversation is missing.");
    const message = this.#addMessage({ conversationId, taskId, role, content, attachments: normalizedAttachments, requiresResponse });
    this.#event("conversation.message", conversationId, { messageId: message.id, taskId, role, requiresResponse, attachmentCount: normalizedAttachments.length });
    return message;
  }

  #addMessage({ conversationId, taskId = null, role, content, attachments = [], requiresResponse = false, createdAt = new Date().toISOString() }) {
    const id = `msg-${randomUUID()}`;
    this.db.prepare(`INSERT INTO conversation_messages(id,conversation_id,task_id,role,content,requires_response,created_at)
      VALUES(?,?,?,?,?,?,?)`).run(id, conversationId, taskId, role, content, requiresResponse ? 1 : 0, createdAt);
    const insertAttachment = this.db.prepare(`INSERT INTO conversation_message_attachments
      (message_id,artifact_id,name,mime_type,size_bytes,sha256,created_at) VALUES(?,?,?,?,?,?,?)`);
    for (const attachment of attachments) insertAttachment.run(id, attachment.id, attachment.name, attachment.mimeType, attachment.sizeBytes, attachment.sha256, createdAt);
    this.db.prepare("UPDATE conversations SET updated_at=? WHERE id=?").run(createdAt, conversationId);
    return { id, conversationId, taskId, role, content, attachments, requiresResponse: Boolean(requiresResponse), createdAt };
  }

  listConversationMessages(conversationId, limit = 500) {
    bounded(conversationId, 80, "conversation id");
    const size = Math.max(1, Math.min(Number(limit) || 500, 1000));
    const attachmentQuery = this.db.prepare("SELECT artifact_id,name,mime_type,size_bytes,sha256 FROM conversation_message_attachments WHERE message_id=? ORDER BY created_at,artifact_id");
    return this.db.prepare("SELECT * FROM conversation_messages WHERE conversation_id=? ORDER BY created_at, id LIMIT ?")
      .all(conversationId, size).map((row) => normalizeMessageWithAttachments(row, attachmentQuery.all(row.id)));
  }

  isArtifactReferenced(artifactId) {
    artifactReferenceId(artifactId);
    return this.db.prepare("SELECT 1 AS found FROM conversation_message_attachments WHERE artifact_id=? LIMIT 1").get(artifactId)?.found === 1;
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

  getTaskByIdempotencyKey(idempotencyKey) {
    bounded(idempotencyKey, 120, "idempotency key");
    const row = this.db.prepare("SELECT * FROM tasks WHERE idempotency_key = ?").get(idempotencyKey);
    return row ? normalizeTask(row) : null;
  }

  listTasks(limit = 100) {
    const size = Math.max(1, Math.min(Number(limit) || 100, 500));
    return this.db.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?").all(size).map(normalizeTask);
  }

  hasActiveTask(capability) {
    validateCapability(capability);
    return Boolean(this.db.prepare(
      "SELECT 1 FROM tasks WHERE capability=? AND status IN ('queued','claimed','running','verifying','waiting','waiting_for_user') LIMIT 1",
    ).get(capability));
  }

  createObjective({ title, correlationId = `obj-${randomUUID()}`, maximumReplans = 2, tasks }) {
    bounded(title, 240, "objective title"); bounded(correlationId, 120, "objective correlation id");
    if (!Number.isInteger(maximumReplans) || maximumReplans < 0 || maximumReplans > 20) throw new TypeError("Objective maximum replans is invalid.");
    if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 64) throw new TypeError("Objective task graph is invalid.");
    const id = `obj-${randomUUID()}`; const now = new Date().toISOString(); const taskIds = new Set();
    for (const task of tasks) { slug(task.id, "objective task id"); if (taskIds.has(task.id)) throw new TypeError("Duplicate objective task id."); taskIds.add(task.id); validateObjectiveTask(task); }
    for (const task of tasks) if (task.dependsOn.some((dependency) => !taskIds.has(dependency))) throw new TypeError("Objective dependency is missing.");
    this.#transaction(() => {
      this.db.prepare("INSERT INTO objectives(id,correlation_id,title,status,maximum_replans,created_at,updated_at) VALUES(?,?,?,'planned',?,?,?)")
        .run(id, correlationId, title, maximumReplans, now, now);
      const statement = this.db.prepare("INSERT INTO objective_tasks(id,objective_id,task_area,task_json,status,created_at,updated_at) VALUES(?,?,?,?, 'planned',?,?)");
      for (const task of tasks) statement.run(task.id, id, task.taskArea, JSON.stringify(task), now, now);
      this.#event("objective.planned", id, { correlationId, taskCount: tasks.length });
    });
    return this.getObjective(id);
  }

  getObjective(id) { bounded(id, 80, "objective id"); const row = this.db.prepare("SELECT * FROM objectives WHERE id=?").get(id); return row ? normalizeObjective(row, this.#objectiveTasks(id)) : null; }
  listObjectives(limit = 100) { const size = Math.max(1, Math.min(Number(limit) || 100, 500)); return this.db.prepare("SELECT * FROM objectives ORDER BY created_at DESC LIMIT ?").all(size).map((row) => normalizeObjective(row, this.#objectiveTasks(row.id))); }

  reconcileObjectives() {
    const released = []; const completed = []; const failed = [];
    for (const objective of this.listObjectives(500).filter((item) => ["planned", "running"].includes(item.status))) {
      const taskById = new Map(objective.tasks.map((task) => [task.id, task]));
      for (const task of objective.tasks.filter((item) => item.status === "released" && item.task?.status === "completed")) this.#setObjectiveTask(task.id, { status: "completed", lastWorkerId: task.task.assignedWorker });
      for (const task of objective.tasks.filter((item) => item.status === "planned")) {
        if (!task.definition.dependsOn.every((dependency) => taskById.get(dependency)?.status === "completed")) continue;
        const created = this.#submitObjectiveTask(objective, task);
        released.push(created);
      }
      const refreshed = this.getObjective(objective.id);
      for (const task of refreshed.tasks.filter((item) => item.status === "released" && item.task?.status === "failed")) {
        if (task.replanCount >= refreshed.maximumReplans) { this.#setObjectiveTask(task.id, { status: "failed", lastWorkerId: task.task.assignedWorker }); failed.push(task.id); continue; }
        this.#setObjectiveTask(task.id, { status: "planned", replanCount: task.replanCount + 1, lastWorkerId: task.task.assignedWorker });
      }
      const final = this.getObjective(objective.id);
      if (final.tasks.some((task) => task.status === "failed")) { this.#setObjective(objective.id, "failed", "A child task exhausted its bounded replanning policy."); failed.push(objective.id); }
      else if (final.tasks.length > 0 && final.tasks.every((task) => task.status === "completed")) { this.#setObjective(objective.id, "completed", "All child tasks completed with worker validation receipts."); completed.push(objective.id); }
      else this.#setObjective(objective.id, "running");
    }
    return { released, completed, failed };
  }

  #submitObjectiveTask(objective, objectiveTask) {
    const definition = objectiveTask.definition;
    const overlapWith = this.listTasks(500).filter((task) => task.taskArea === definition.taskArea && !["completed", "failed", "cancelled"].includes(task.status)).map((task) => task.id);
    const task = this.submitTask({ ...definition, correlationId: objective.correlationId, idempotencyKey: `${objective.id}:${objectiveTask.id}:r${objectiveTask.replanCount}`, requestedOutcome: definition.requestedOutcome ?? objective.title, taskArea: definition.taskArea, excludedWorkerIds: objectiveTask.lastWorkerId ? [objectiveTask.lastWorkerId] : [] });
    this.#setObjectiveTask(objectiveTask.id, { status: "released", taskId: task.id });
    this.#event("objective.task.released", objectiveTask.id, { objectiveId: objective.id, taskId: task.id, overlapWith });
    return { objectiveId: objective.id, objectiveTaskId: objectiveTask.id, taskId: task.id, overlapWith };
  }

  #objectiveTasks(objectiveId) { return this.db.prepare("SELECT * FROM objective_tasks WHERE objective_id=? ORDER BY created_at, id").all(objectiveId).map((row) => normalizeObjectiveTask(row, row.task_id ? this.getTask(row.task_id) : null)); }
  #setObjective(id, status, summary = null) { this.db.prepare("UPDATE objectives SET status=?, summary=COALESCE(?,summary), updated_at=? WHERE id=?").run(status, summary, new Date().toISOString(), id); }
  #setObjectiveTask(id, { status, taskId = undefined, replanCount = undefined, lastWorkerId = undefined }) {
    const assignments = ["updated_at=?"]; const values = [new Date().toISOString()];
    if (status !== undefined) { assignments.push("status=?"); values.push(status); }
    if (taskId !== undefined) { assignments.push("task_id=?"); values.push(taskId); }
    if (replanCount !== undefined) { assignments.push("replan_count=?"); values.push(replanCount); }
    if (lastWorkerId !== undefined) { assignments.push("last_worker_id=?"); values.push(lastWorkerId); }
    values.push(id); this.db.prepare(`UPDATE objective_tasks SET ${assignments.join(",")} WHERE id=?`).run(...values);
  }

  retryTask(id) {
    bounded(id, 80, "task id");
    const now = new Date().toISOString();
    const changed = this.db.prepare(`UPDATE tasks SET status='queued', assigned_worker=NULL, attempt_count=0,
      lease_expires_at=NULL, result_summary=NULL, error_code=NULL, updated_at=?
      WHERE id=? AND status IN ('failed','waiting','cancelled')`).run(now, id);
    if (changed.changes === 1) this.#event("task.retried", id, { requestedBy: "control-center" });
    return this.getTask(id);
  }

  cancelTask(id) {
    bounded(id, 80, "task id");
    const now = new Date().toISOString();
    const changed = this.db.prepare(`UPDATE tasks SET status='cancelled', lease_expires_at=NULL,
      error_code='cancelled-by-user', updated_at=? WHERE id=?
      AND status IN ('queued','claimed','running','verifying','waiting','waiting_for_user')`).run(now, id);
    if (changed.changes === 1) this.#event("task.cancelled", id, { requestedBy: "control-center" });
    return this.getTask(id);
  }

  createCodexBuilderSession({ taskId, authoritySessionId = null }) {
    bounded(taskId, 80, "task id");
    if (authoritySessionId !== null) bounded(authoritySessionId, 120, "authority session id");
    const task = this.getTask(taskId);
    if (!task || task.capability !== "codex.execute") throw new TypeError("Codex Builder task is missing.");
    const existing = this.db.prepare("SELECT * FROM codex_builder_sessions WHERE task_id=?").get(taskId);
    if (existing) return normalizeCodexBuilderSession(existing);
    const id = `cbs-${randomUUID()}`; const executionSessionId = `cdb-${randomUUID()}`; const now = new Date().toISOString();
    this.db.prepare("INSERT INTO codex_builder_sessions(id,task_id,correlation_id,authority_session_id,execution_session_id,status,created_at,updated_at) VALUES(?,?,?,?,?,'PREPARED',?,?)")
      .run(id, task.id, task.correlationId, authoritySessionId, executionSessionId, now, now);
    this.#event("codex-builder.prepared", id, { taskId: task.id, correlationId: task.correlationId, executionSessionId });
    return this.getCodexBuilderSession(id);
  }

  getCodexBuilderSession(id) { bounded(id, 80, "builder session id"); const row = this.db.prepare("SELECT * FROM codex_builder_sessions WHERE id=?").get(id); return row ? normalizeCodexBuilderSession(row) : null; }
  listCodexBuilderSessions(limit = 100) { const size = Math.max(1, Math.min(Number(limit) || 100, 500)); return this.db.prepare("SELECT * FROM codex_builder_sessions ORDER BY created_at DESC LIMIT ?").all(size).map(normalizeCodexBuilderSession); }

  recordCodexBuilderResult({ sessionId, status, verificationState = "not-run", changedFileCount = 0, commitId = null }) {
    bounded(sessionId, 80, "builder session id");
    if (!new Set(["completed", "failed"]).has(status)) throw new TypeError("Codex Builder result status is invalid.");
    if (!new Set(["passed", "failed", "not-run"]).has(verificationState)) throw new TypeError("Codex Builder verification state is invalid.");
    if (!Number.isInteger(changedFileCount) || changedFileCount < 0 || changedFileCount > 10000) throw new TypeError("Codex Builder changed file count is invalid.");
    if (commitId !== null && !/^[a-f0-9]{7,64}$/i.test(commitId)) throw new TypeError("Codex Builder commit is invalid.");
    const session = this.getCodexBuilderSession(sessionId);
    if (!session || session.status !== "PREPARED") return session;
    const task = this.getTask(session.taskId); const now = new Date().toISOString();
    const summary = `Task-scoped Codex Builder result recorded: ${status}; verification=${verificationState}; changed-files=${changedFileCount}${commitId ? `; commit=${commitId.slice(0, 12)}` : ""}.`;
    this.#transaction(() => {
      this.db.prepare("UPDATE codex_builder_sessions SET status=?, updated_at=? WHERE id=? AND status='PREPARED'").run(status === "completed" ? "RETURNED" : "FAILED", now, sessionId);
      this.db.prepare("UPDATE tasks SET status=?, assigned_worker='primary-codex-builder', verifier='primary-codex-result-adapter', result_summary=?, error_code=?, updated_at=? WHERE id=? AND status='queued'")
        .run(status, summary, status === "failed" ? "codex-builder-result-failed" : null, now, task.id);
      this.recordReceipt({ task, phase: status, verifier: "primary-codex-result-adapter", summary });
      this.#event("codex-builder.result-recorded", sessionId, { taskId: task.id, status, verificationState, changedFileCount, commitId: commitId?.slice(0, 12) ?? null });
    });
    return this.getCodexBuilderSession(sessionId);
  }

  createSecondaryAssignment({ title, taskArea, expectedTask, expectedBaseCommit, correlationId = `secondary-${randomUUID()}`, allowedPaths = [] }) {
    bounded(title, 240, "secondary assignment title"); slug(taskArea, "secondary task area"); bounded(expectedTask, 400, "secondary expected task"); bounded(correlationId, 120, "secondary correlation id");
    if (!/^[a-f0-9]{7,64}$/i.test(expectedBaseCommit)) throw new TypeError("Secondary expected base commit is invalid.");
    const paths = coordinationPaths(allowedPaths);
    const id = `sec-${randomUUID()}`; const now = new Date().toISOString(); const returnBranch = `secondary/${id}`;
    this.db.prepare("INSERT INTO secondary_assignments(id,correlation_id,title,task_area,expected_task,expected_base_commit,return_branch,status,allowed_paths_json,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'READY',?,'runtime-api',?,?)")
      .run(id, correlationId, title, taskArea, expectedTask, expectedBaseCommit.toLowerCase(), returnBranch, JSON.stringify(paths), now, now);
    this.#event("secondary-codex.ready", id, { correlationId, taskArea, expectedBaseCommit: expectedBaseCommit.slice(0, 12), returnBranch });
    return this.getSecondaryAssignment(id);
  }

  importSecondaryAssignment(record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new TypeError("Secondary coordination assignment is invalid.");
    if (!/^sec-[a-f0-9-]{8,72}$/i.test(record.assignmentId)) throw new TypeError("Secondary coordination assignment ID is invalid.");
    bounded(record.correlationId, 120, "secondary assignment correlation ID"); bounded(record.title, 240, "secondary assignment title");
    slug(record.taskArea, "secondary assignment task area"); boundedMultiline(record.expectedTask, 1000, "secondary assignment expected task");
    if (!/^[a-f0-9]{7,64}$/i.test(record.expectedBaseCommit)) throw new TypeError("Secondary expected base commit is invalid.");
    if (record.returnBranch !== `secondary/${record.assignmentId}`) throw new TypeError("Secondary return branch is invalid.");
    const paths = coordinationPaths(record.allowedPaths);
    const existing = this.getSecondaryAssignment(record.assignmentId);
    if (existing) {
      const matches = existing.correlationId === record.correlationId && existing.title === record.title && existing.taskArea === record.taskArea &&
        existing.expectedTask === record.expectedTask && existing.expectedBaseCommit === record.expectedBaseCommit.toLowerCase() &&
        existing.returnBranch === record.returnBranch && existing.source === "github-mailbox" && JSON.stringify(existing.allowedPaths) === JSON.stringify(paths);
      if (!matches) throw new TypeError(`Conflicting GitHub coordination assignment: ${record.assignmentId}`);
      return existing;
    }
    const now = new Date().toISOString();
    this.db.prepare("INSERT INTO secondary_assignments(id,correlation_id,title,task_area,expected_task,expected_base_commit,return_branch,status,allowed_paths_json,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'READY',?,'github-mailbox',?,?)")
      .run(record.assignmentId, record.correlationId, record.title, record.taskArea, record.expectedTask, record.expectedBaseCommit.toLowerCase(), record.returnBranch, JSON.stringify(paths), record.createdAt, now);
    this.#event("secondary-codex.github-imported", record.assignmentId, { correlationId: record.correlationId, taskArea: record.taskArea, expectedBaseCommit: record.expectedBaseCommit.slice(0, 12), returnBranch: record.returnBranch });
    return this.getSecondaryAssignment(record.assignmentId);
  }

  getSecondaryAssignment(id) { bounded(id, 80, "secondary assignment id"); const row = this.db.prepare("SELECT * FROM secondary_assignments WHERE id=?").get(id); return row ? normalizeSecondaryAssignment(row) : null; }
  listSecondaryAssignments(limit = 100) { const size = Math.max(1, Math.min(Number(limit) || 100, 500)); return this.db.prepare("SELECT * FROM secondary_assignments ORDER BY created_at DESC LIMIT ?").all(size).map(normalizeSecondaryAssignment); }
  readySecondaryAssignments() { return this.db.prepare("SELECT * FROM secondary_assignments WHERE status='READY' ORDER BY created_at").all().map(normalizeSecondaryAssignment); }

  observeSecondaryReturn({ assignmentId, remoteAvailable, returnCommit = null }) {
    const assignment = this.getSecondaryAssignment(assignmentId);
    if (!assignment || assignment.status !== "READY") return assignment;
    if (returnCommit !== null && !/^[a-f0-9]{7,64}$/i.test(returnCommit)) throw new TypeError("Secondary return commit is invalid.");
    const now = new Date().toISOString();
    const observation = remoteAvailable ? (returnCommit ? "return-commit-detected" : "return-branch-not-yet-present") : "remote-unavailable";
    const status = returnCommit ? "RETURNED" : "READY";
    this.db.prepare("UPDATE secondary_assignments SET status=?, return_commit=COALESCE(?,return_commit), last_observation=?, updated_at=? WHERE id=? AND status='READY'")
      .run(status, returnCommit?.toLowerCase() ?? null, observation, now, assignmentId);
    this.#event(returnCommit ? "secondary-codex.return-detected" : "secondary-codex.monitored", assignmentId, { remoteAvailable: Boolean(remoteAvailable), returnCommit: returnCommit?.slice(0, 12) ?? null });
    return this.getSecondaryAssignment(assignmentId);
  }

  attachSecondaryValidation({ assignmentId, taskId }) {
    bounded(taskId, 80, "validation task id");
    const assignment = this.getSecondaryAssignment(assignmentId); const task = this.getTask(taskId);
    if (!assignment || assignment.status !== "RETURNED" || !task) return assignment;
    this.db.prepare("UPDATE secondary_assignments SET validation_task_id=?, status='VALIDATING', updated_at=? WHERE id=? AND status='RETURNED'").run(taskId, new Date().toISOString(), assignmentId);
    this.#event("secondary-codex.validation-queued", assignmentId, { taskId, returnCommit: assignment.returnCommit?.slice(0, 12) ?? null });
    return this.getSecondaryAssignment(assignmentId);
  }

  completeSecondaryValidation({ taskId, verified }) {
    bounded(taskId, 80, "validation task id");
    const assignment = this.db.prepare("SELECT * FROM secondary_assignments WHERE validation_task_id=? AND status='VALIDATING'").get(taskId);
    if (!assignment) return null;
    const status = verified ? "VALIDATED" : "REJECTED"; const verificationState = verified ? "passed" : "failed";
    this.db.prepare("UPDATE secondary_assignments SET status=?, verification_state=?, updated_at=? WHERE id=?").run(status, verificationState, new Date().toISOString(), assignment.id);
    this.#event("secondary-codex.validation-complete", assignment.id, { taskId, verified: Boolean(verified) });
    return this.getSecondaryAssignment(assignment.id);
  }

  getIntegrationLease(now = new Date()) {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError("Integration lease observation time is invalid.");
    this.db.prepare("DELETE FROM controller_integration_lease WHERE expires_at<=?").run(now.toISOString());
    const row = this.db.prepare("SELECT * FROM controller_integration_lease LIMIT 1").get();
    return row ? normalizeIntegrationLease(row) : null;
  }

  acquireIntegrationLease({ controllerId, durationMs, purpose, paths = [] }) {
    integrationController(controllerId);
    if (!Number.isInteger(durationMs) || durationMs < 1_000 || durationMs > MAX_INTEGRATION_LEASE_MS) throw new TypeError("Integration lease duration is invalid.");
    bounded(purpose, 200, "integration lease purpose");
    const normalizedPaths = integrationPaths(paths);
    const acquiredAt = new Date();
    return this.#transaction(() => {
      this.db.prepare("DELETE FROM controller_integration_lease WHERE expires_at<=?").run(acquiredAt.toISOString());
      const activeRow = this.db.prepare("SELECT * FROM controller_integration_lease LIMIT 1").get();
      if (activeRow) {
        const active = normalizeIntegrationLease(activeRow);
        return { acquired: false, lease: active, overlaps: overlappingPaths(active.paths, normalizedPaths) };
      }
      const leaseId = `int-${randomUUID()}`;
      const expiresAt = new Date(acquiredAt.getTime() + durationMs).toISOString();
      this.db.prepare("INSERT INTO controller_integration_lease(lease_id,controller_id,purpose,paths_json,acquired_at,expires_at) VALUES(?,?,?,?,?,?)")
        .run(leaseId, controllerId, purpose.trim(), JSON.stringify(normalizedPaths), acquiredAt.toISOString(), expiresAt);
      this.#event("integration-lease.acquired", leaseId, { controllerId, expiresAt });
      return { acquired: true, lease: normalizeIntegrationLease(this.db.prepare("SELECT * FROM controller_integration_lease WHERE lease_id=?").get(leaseId)), overlaps: [] };
    });
  }

  releaseIntegrationLease({ controllerId, leaseId }) {
    integrationController(controllerId);
    if (typeof leaseId !== "string" || !/^int-[a-f0-9-]{36,}$/i.test(leaseId)) throw new TypeError("Integration lease ID is invalid.");
    return this.#transaction(() => {
      const row = this.db.prepare("SELECT * FROM controller_integration_lease WHERE lease_id=?").get(leaseId);
      if (!row) return { released: false, lease: null };
      const active = normalizeIntegrationLease(row);
      if (active.controllerId !== controllerId) throw new Error("integration-lease-owner-required");
      this.db.prepare("DELETE FROM controller_integration_lease WHERE lease_id=?").run(leaseId);
      this.#event("integration-lease.released", leaseId, { controllerId });
      return { released: true, lease: active };
    });
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

  finishTask(id, { status, resultSummary = null, errorCode = null, receiptMetadata = {} }) {
    if (!new Set(["completed", "failed", "waiting", "cancelled"]).has(status)) throw new TypeError("Terminal task status is invalid.");
    if (resultSummary !== null) bounded(resultSummary, 2000, "result summary");
    if (errorCode !== null) bounded(errorCode, 80, "error code");
    const task = this.getTask(id);
    const now = new Date().toISOString();
    const changed = this.db.prepare(`UPDATE tasks SET status=?, result_summary=?, error_code=?, lease_expires_at=NULL, updated_at=?
      WHERE id=? AND status IN ('running','verifying')`).run(status, resultSummary, errorCode, now, id);
    if (changed.changes === 1) {
      this.#event(`task.${status}`, id, { errorCode });
      this.recordReceipt({ task, phase: status, verifier: task?.verifier ?? "worker-result", summary: resultSummary ?? errorCode ?? `Task ${status}.`, metadata: receiptMetadata });
      if (task?.conversationId) {
        const content = status === "completed"
          ? (resultSummary ?? "Task completed and verified.")
          : (resultSummary ?? `Task ${status}${errorCode ? `: ${errorCode}` : "."}`);
        this.addConversationMessage({
          conversationId: task.conversationId, taskId: id,
          role: status === "completed" ? "assistant" : "system", content,
        });
      }
    }
    return this.getTask(id);
  }

  recordReceipt({ task, phase, verifier, summary, metadata = {} }) {
    if (!task) throw new TypeError("Task is required for a receipt.");
    bounded(phase, 40, "receipt phase"); bounded(verifier, 80, "receipt verifier"); bounded(summary, 2000, "receipt summary");
    const receiptMetadata = normalizeReceiptMetadata(metadata);
    const id = `rcpt-${randomUUID()}`; const createdAt = new Date().toISOString();
    this.db.prepare("INSERT INTO execution_receipts(id,task_id,correlation_id,phase,verifier,summary,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(id, task.id, task.correlationId, phase, verifier, summary, JSON.stringify(receiptMetadata), createdAt);
    this.#event("task.receipt", task.id, { receiptId: id, correlationId: task.correlationId, phase, verifier });
    return { id, taskId: task.id, correlationId: task.correlationId, phase, verifier, summary, metadata: receiptMetadata, createdAt };
  }

  listReceipts(taskId, limit = 100) {
    bounded(taskId, 80, "receipt task id");
    const size = Math.max(1, Math.min(Number(limit) || 100, 500));
    return this.db.prepare("SELECT * FROM execution_receipts WHERE task_id=? ORDER BY created_at DESC LIMIT ?").all(taskId, size).map((row) => ({
      id: row.id, taskId: row.task_id, correlationId: row.correlation_id, phase: row.phase, verifier: row.verifier,
      summary: row.summary, metadata: JSON.parse(row.metadata_json ?? "{}"), createdAt: row.created_at,
    }));
  }

  recordAnswerEvaluation({ taskId, attemptNumber, evaluatorVersion, decision, reasons, evidence }) {
    bounded(taskId, 80, "answer evaluation task id");
    const task = this.getTask(taskId);
    if (!task) throw new TypeError("Answer evaluation task is missing.");
    const normalized = normalizeAnswerEvaluation({ taskId, attemptNumber, evaluatorVersion, decision, reasons, evidence });
    if (normalized.attemptNumber !== task.attemptCount) throw new TypeError("Answer evaluation attempt does not match the task attempt.");
    const existing = this.db.prepare("SELECT * FROM answer_evaluations WHERE task_id=? AND attempt_number=?").get(taskId, attemptNumber);
    if (existing) {
      const stored = normalizeAnswerEvaluationRow(existing);
      if (answerEvaluationIdentity(stored) !== answerEvaluationIdentity(normalized)) throw new Error("answer-evaluation-conflict");
      return stored;
    }
    const id = `ae-${randomUUID()}`; const createdAt = new Date().toISOString();
    this.db.prepare(`INSERT INTO answer_evaluations
      (id,task_id,attempt_number,evaluator_version,decision,reason_codes_json,summary_sha256,criteria_sha256,
       summary_word_count,criterion_token_count,matched_criterion_count,provider_verified,declared_evidence_count,
       acknowledgement_detected,vague_detected,contradiction_detected,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, taskId, normalized.attemptNumber, normalized.evaluatorVersion, normalized.decision, JSON.stringify(normalized.reasons),
      normalized.evidence.summarySha256, normalized.evidence.criteriaSha256, normalized.evidence.summaryWordCount,
      normalized.evidence.criterionTokenCount, normalized.evidence.matchedCriterionCount, normalized.evidence.providerVerified ? 1 : 0,
      normalized.evidence.declaredEvidenceCount, normalized.evidence.acknowledgementDetected ? 1 : 0,
      normalized.evidence.vagueDetected ? 1 : 0, normalized.evidence.contradictionDetected ? 1 : 0, createdAt);
    this.#event("answer.evaluated", taskId, { evaluationId: id, attemptNumber, decision, reasons: normalized.reasons });
    return normalizeAnswerEvaluationRow(this.db.prepare("SELECT * FROM answer_evaluations WHERE id=?").get(id));
  }

  listAnswerEvaluations(taskId, limit = 20) {
    bounded(taskId, 80, "answer evaluation task id");
    const size = Math.max(1, Math.min(Number(limit) || 20, 100));
    return this.db.prepare("SELECT * FROM answer_evaluations WHERE task_id=? ORDER BY attempt_number DESC LIMIT ?")
      .all(taskId, size).map(normalizeAnswerEvaluationRow);
  }

  requeueAfterAnswerEvaluation({ taskId, decision, excludedWorkerId = null }) {
    if (!new Set(["retry", "reroute"]).has(decision)) throw new TypeError("Answer evaluation requeue decision is invalid.");
    const task = this.getTask(taskId);
    if (!task || task.status !== "verifying") return task;
    if (task.attemptCount >= task.maximumAttempts) throw new Error("answer-evaluation-attempts-exhausted");
    const excluded = new Set(task.excludedWorkerIds);
    if (excludedWorkerId !== null) { slug(excludedWorkerId, "excluded answer worker"); excluded.add(excludedWorkerId); }
    if (excluded.size > 16) throw new TypeError("Excluded worker IDs are invalid.");
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE tasks SET status='queued', assigned_worker=NULL, lease_expires_at=NULL,
      error_code=?, excluded_worker_ids=?, updated_at=? WHERE id=? AND status='verifying'`)
      .run(`answer-quality-${decision}`, JSON.stringify([...excluded]), now, taskId);
    this.#event("answer.requeued", taskId, { attemptNumber: task.attemptCount, decision, excludedWorkerId });
    return this.getTask(taskId);
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

  setWorkerState({ workerId, status, pid = null, restartCount = 0, lastHeartbeatAt = null, lastErrorCode = null, lastErrorDetail = null }) {
    bounded(workerId, 64, "worker id"); bounded(status, 30, "worker status");
    if (lastErrorCode !== null) bounded(lastErrorCode, 80, "worker error code");
    if (lastErrorDetail !== null) bounded(lastErrorDetail, 1000, "worker error detail");
    this.db.prepare(`INSERT INTO worker_state(worker_id,status,pid,restart_count,last_heartbeat_at,last_error_code,last_error_detail)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(worker_id) DO UPDATE SET status=excluded.status,pid=excluded.pid,
      restart_count=excluded.restart_count,last_heartbeat_at=excluded.last_heartbeat_at,last_error_code=excluded.last_error_code,
      last_error_detail=excluded.last_error_detail`)
      .run(workerId, status, pid, restartCount, lastHeartbeatAt, lastErrorCode, lastErrorDetail);
  }

  listWorkerState() { return this.db.prepare("SELECT * FROM worker_state ORDER BY worker_id").all().map((row) => ({
    workerId: row.worker_id, status: row.status, pid: row.pid, restartCount: row.restart_count,
    lastHeartbeatAt: row.last_heartbeat_at, lastErrorCode: row.last_error_code, lastErrorDetail: row.last_error_detail,
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

function normalizeAnswerEvaluation(value) {
  if (!isRecord(value)) throw new TypeError("Answer evaluation is invalid.");
  const keys = new Set(["taskId", "attemptNumber", "evaluatorVersion", "decision", "reasons", "evidence"]);
  for (const key of Object.keys(value)) if (!keys.has(key)) throw new TypeError("Answer evaluation field is invalid.");
  bounded(value.taskId, 80, "answer evaluation task id");
  if (!Number.isInteger(value.attemptNumber) || value.attemptNumber < 1 || value.attemptNumber > 20) throw new TypeError("Answer evaluation attempt is invalid.");
  if (typeof value.evaluatorVersion !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(value.evaluatorVersion)) throw new TypeError("Answer evaluator version is invalid.");
  if (!ANSWER_EVALUATION_STATES.has(value.decision)) throw new TypeError("Answer evaluation decision is invalid.");
  if (!Array.isArray(value.reasons) || value.reasons.length > 12 || new Set(value.reasons).size !== value.reasons.length) throw new TypeError("Answer evaluation reasons are invalid.");
  for (const reason of value.reasons) slug(reason, "answer evaluation reason");
  if ((value.decision === "accepted") !== (value.reasons.length === 0)) throw new TypeError("Answer evaluation reasons do not match the decision.");
  if (!isRecord(value.evidence)) throw new TypeError("Answer evaluation evidence is invalid.");
  const evidenceKeys = new Set(["summarySha256", "criteriaSha256", "summaryWordCount", "criterionTokenCount", "matchedCriterionCount", "providerVerified", "declaredEvidenceCount", "acknowledgementDetected", "vagueDetected", "contradictionDetected"]);
  for (const key of Object.keys(value.evidence)) if (!evidenceKeys.has(key)) throw new TypeError("Answer evaluation evidence field is invalid.");
  for (const key of ["summarySha256", "criteriaSha256"]) if (typeof value.evidence[key] !== "string" || !/^[a-f0-9]{64}$/.test(value.evidence[key])) throw new TypeError("Answer evaluation digest is invalid.");
  for (const key of ["summaryWordCount", "criterionTokenCount", "matchedCriterionCount", "declaredEvidenceCount"]) {
    if (!Number.isInteger(value.evidence[key]) || value.evidence[key] < 0 || value.evidence[key] > 100000) throw new TypeError("Answer evaluation count is invalid.");
  }
  if (value.evidence.matchedCriterionCount > value.evidence.criterionTokenCount) throw new TypeError("Answer evaluation criterion counts are invalid.");
  for (const key of ["providerVerified", "acknowledgementDetected", "vagueDetected", "contradictionDetected"]) {
    if (typeof value.evidence[key] !== "boolean") throw new TypeError("Answer evaluation signal is invalid.");
  }
  return Object.freeze({
    taskId: value.taskId, attemptNumber: value.attemptNumber, evaluatorVersion: value.evaluatorVersion,
    decision: value.decision, reasons: Object.freeze([...value.reasons]), evidence: Object.freeze({ ...value.evidence }),
  });
}
function normalizeAnswerEvaluationRow(row) {
  const normalized = normalizeAnswerEvaluation({
    taskId: row.task_id, attemptNumber: row.attempt_number, evaluatorVersion: row.evaluator_version, decision: row.decision,
    reasons: JSON.parse(row.reason_codes_json), evidence: {
      summarySha256: row.summary_sha256, criteriaSha256: row.criteria_sha256, summaryWordCount: row.summary_word_count,
      criterionTokenCount: row.criterion_token_count, matchedCriterionCount: row.matched_criterion_count,
      providerVerified: Boolean(row.provider_verified), declaredEvidenceCount: row.declared_evidence_count,
      acknowledgementDetected: Boolean(row.acknowledgement_detected), vagueDetected: Boolean(row.vague_detected),
      contradictionDetected: Boolean(row.contradiction_detected),
    },
  });
  return Object.freeze({ id: row.id, ...normalized, createdAt: row.created_at });
}
function answerEvaluationIdentity(value) {
  return JSON.stringify({
    taskId: value.taskId, attemptNumber: value.attemptNumber, evaluatorVersion: value.evaluatorVersion,
    decision: value.decision, reasons: value.reasons, evidence: value.evidence,
  });
}

function normalizeTask(row) { if (!TASK_STATES.has(row.status)) throw new Error("Stored task status is invalid."); return {
  id: row.id, idempotencyKey: row.idempotency_key, correlationId: row.correlation_id, taskType: row.task_type,
  requestedOutcome: row.requested_outcome, capability: row.capability, dataClass: row.data_class,
  requestedMode: row.requested_mode, status: row.status, assignedWorker: row.assigned_worker,
  attemptCount: row.attempt_count, leaseExpiresAt: row.lease_expires_at, resultSummary: row.result_summary,
  errorCode: row.error_code, executionPlane: row.execution_plane, priority: row.priority,
  maximumAttempts: row.maximum_attempts, checkpoint: row.checkpoint, verifier: row.verifier,
  conversationId: row.conversation_id,
  taskArea: row.task_area ?? "general", excludedWorkerIds: JSON.parse(row.excluded_worker_ids ?? "[]"),
  completionCriteria: row.completion_criteria ?? "worker-verified",
  createdAt: row.created_at, updatedAt: row.updated_at,
}; }
function assertIdempotentTaskRequest(task, request) {
  const fields = ["correlationId", "taskType", "requestedOutcome", "capability", "dataClass", "requestedMode", "executionPlane", "priority", "maximumAttempts", "conversationId", "taskArea", "completionCriteria"];
  for (const field of fields) if (task[field] !== request[field]) {
    throw idempotencyConflict(field);
  }
  const storedExcluded = [...task.excludedWorkerIds].sort();
  const requestedExcluded = [...request.excludedWorkerIds].sort();
  if (JSON.stringify(storedExcluded) !== JSON.stringify(requestedExcluded)) {
    throw idempotencyConflict("excludedWorkerIds");
  }
}
function idempotencyConflict(field) {
  const error = new TypeError(`Idempotency key conflicts with a different task request: ${field}`);
  error.code = "idempotency-conflict";
  return error;
}
function normalizeObjective(row, tasks) { return { id: row.id, correlationId: row.correlation_id, title: row.title, status: row.status, maximumReplans: row.maximum_replans, replanCount: row.replan_count, summary: row.summary, tasks, createdAt: row.created_at, updatedAt: row.updated_at }; }
function normalizeObjectiveTask(row, task) { return { id: row.id, objectiveId: row.objective_id, taskArea: row.task_area, definition: JSON.parse(row.task_json), status: row.status, taskId: row.task_id, task, replanCount: row.replan_count, lastWorkerId: row.last_worker_id, createdAt: row.created_at, updatedAt: row.updated_at }; }
function normalizeConversation(row) { return { id: row.id, title: row.title, status: row.status, currentTaskId: row.current_task_id, createdAt: row.created_at, updatedAt: row.updated_at }; }
function normalizeMessage(row) { return { id: row.id, conversationId: row.conversation_id, taskId: row.task_id, role: row.role, content: row.content, requiresResponse: Boolean(row.requires_response), createdAt: row.created_at }; }
function normalizeMessageWithAttachments(row, attachments) {
  return { ...normalizeMessage(row), attachments: attachments.map((item) => ({ id: item.artifact_id, name: item.name, mimeType: item.mime_type, sizeBytes: item.size_bytes, sha256: item.sha256 })) };
}
function normalizeCodexBuilderSession(row) { return { id: row.id, taskId: row.task_id, correlationId: row.correlation_id, authoritySessionId: row.authority_session_id, executionSessionId: row.execution_session_id, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at }; }
function normalizeSecondaryAssignment(row) { return { id: row.id, correlationId: row.correlation_id, title: row.title, taskArea: row.task_area, expectedTask: row.expected_task, expectedBaseCommit: row.expected_base_commit, returnBranch: row.return_branch, allowedPaths: JSON.parse(row.allowed_paths_json ?? "[]"), source: row.source ?? "runtime-api", status: row.status, returnCommit: row.return_commit, validationTaskId: row.validation_task_id, verificationState: row.verification_state, lastObservation: row.last_observation, createdAt: row.created_at, updatedAt: row.updated_at }; }
function normalizeIntegrationLease(row) { return { leaseId: row.lease_id, controllerId: row.controller_id, purpose: row.purpose, paths: JSON.parse(row.paths_json), acquiredAt: row.acquired_at, expiresAt: row.expires_at }; }
function integrationController(value) { if (!PRIMARY_CONTROLLERS.includes(value)) throw new TypeError("Primary integration controller is invalid."); return value; }
function integrationPaths(value) {
  if (!Array.isArray(value) || value.length > 64) throw new TypeError("Integration lease paths are invalid.");
  return [...new Set(value.map((item) => {
    if (typeof item !== "string") throw new TypeError("Integration lease path is invalid.");
    const normalized = item.replace(/^\.\//, "").replace(/\/$/, "");
    if (!normalized || normalized.length > 240 || normalized.startsWith("/") || normalized.includes("\\") || normalized.split("/").includes("..")) throw new TypeError("Integration lease path is invalid.");
    return normalized;
  }))].sort();
}
function normalizeImprovement(row) { if (!IMPROVEMENT_STATES.has(row.status)) throw new Error("Stored improvement status is invalid."); return {
  id: row.id, title: row.title, summary: row.summary, status: row.status, testSummary: row.test_summary,
  createdAt: row.created_at, decidedAt: row.decided_at, activatedAt: row.activated_at,
}; }
function normalizeReceiptMetadata(value) {
  if (value === null || value === undefined) return {};
  if (!isRecord(value)) throw new TypeError("Receipt metadata is invalid.");
  const allowed = new Set(["operation", "titleSha256", "artifactSha256", "screenshotWidth", "screenshotHeight", "networkRequests", "networkFailures", "networkStatus2xx", "networkStatus3xx", "networkStatus4xx", "networkStatus5xx", "consoleErrors", "consoleWarnings", "consoleHashCount"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError("Receipt metadata key is invalid.");
  const metadata = {};
  if (value.operation !== undefined) {
    if (value.operation !== "browser-observe") throw new TypeError("Receipt operation is invalid.");
    metadata.operation = value.operation;
  }
  for (const key of ["titleSha256", "artifactSha256"]) {
    if (value[key] === undefined) continue;
    if (!/^[a-f0-9]{64}$/i.test(value[key])) throw new TypeError("Receipt digest is invalid.");
    metadata[key] = value[key].toLowerCase();
  }
  for (const key of ["screenshotWidth", "screenshotHeight", "networkRequests", "networkFailures", "networkStatus2xx", "networkStatus3xx", "networkStatus4xx", "networkStatus5xx", "consoleErrors", "consoleWarnings", "consoleHashCount"]) {
    if (value[key] === undefined) continue;
    if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 100000) throw new TypeError("Receipt metric is invalid.");
    metadata[key] = value[key];
  }
  return Object.freeze(metadata);
}
function conversationAttachments(value) {
  if (!Array.isArray(value) || value.length > 20 || new Set(value.map((item) => item?.id)).size !== value.length) throw new TypeError("Conversation attachments are invalid.");
  return value.map((item) => {
    if (!isRecord(item)) throw new TypeError("Conversation attachment is invalid.");
    const allowed = new Set(["id", "name", "mimeType", "sizeBytes", "sha256", "source", "createdAt", "storageClass"]);
    for (const key of Object.keys(item)) if (!allowed.has(key)) throw new TypeError("Conversation attachment field is invalid.");
    artifactReferenceId(item.id);
    bounded(item.name, 200, "attachment name");
    if (typeof item.mimeType !== "string" || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(item.mimeType)) throw new TypeError("Attachment MIME type is invalid.");
    if (!Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 1 || item.sizeBytes > 100 * 1024 * 1024) throw new TypeError("Attachment size is invalid.");
    if (!/^[a-f0-9]{64}$/.test(item.sha256)) throw new TypeError("Attachment digest is invalid.");
    return Object.freeze({ id: item.id, name: item.name, mimeType: item.mimeType.toLowerCase(), sizeBytes: item.sizeBytes, sha256: item.sha256 });
  });
}
function artifactReferenceId(value) { if (typeof value !== "string" || !/^art-[a-f0-9-]{36,}$/.test(value)) throw new TypeError("Artifact reference is invalid."); }
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function validateCapability(value) { if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,31}\.[a-z][a-z0-9-]{0,31}$/.test(value)) throw new TypeError("Capability is invalid."); }
function validateDataClass(value) { if (!new Set(["synthetic", "personal", "enterprise", "local-only"]).has(value)) throw new TypeError("Data class is invalid."); }
function validateObjectiveTask(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Objective task is invalid.");
  validateCapability(value.capability); validateDataClass(value.dataClass);
  if (!Array.isArray(value.dependsOn) || value.dependsOn.length > 16) throw new TypeError("Objective dependencies are invalid.");
  value.dependsOn.forEach((item) => slug(item, "objective dependency"));
  slug(value.taskArea, "objective task area");
  bounded(value.owner ?? "mahoraga", 64, "objective owner"); bounded(value.provider ?? "deterministic", 64, "objective provider");
  bounded(value.retryPolicy ?? "bounded", 64, "objective retry policy"); bounded(value.completionCriteria ?? "worker-verified", 400, "objective completion criteria");
}
function bounded(value, max, name) { if (typeof value !== "string" || value.length < 1 || value.length > max || /[\r\n]/.test(value)) throw new TypeError(`${name} is invalid.`); }
function boundedMultiline(value, max, name) { if (typeof value !== "string" || value.trim().length < 1 || value.length > max || /\u0000/.test(value)) throw new TypeError(`${name} is invalid.`); }
function slug(value, name) { if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) throw new TypeError(`${name} is invalid.`); }
function coordinationPaths(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32 || new Set(value).size !== value.length) throw new TypeError("Secondary assignment allowed paths are invalid.");
  for (const item of value) if (typeof item !== "string" || item.length < 1 || item.length > 160 || item.startsWith("/") || item.startsWith("\\") || item.includes("..") || item.includes("\\") || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(item)) throw new TypeError("Secondary assignment allowed path is invalid.");
  return [...value];
}
