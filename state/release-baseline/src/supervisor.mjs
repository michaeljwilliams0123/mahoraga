import { fork } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routeTask } from "./router.mjs";
import { ANSWER_EVALUATOR_VERSION, evaluateAnswerQuality, unresolvedAnswerSummary } from "./answer-quality.mjs";
import { syncCoordinationAssignments } from "./coordination-mailbox.mjs";

const WORKER_PROCESS = path.join(path.dirname(fileURLToPath(import.meta.url)), "worker-process.mjs");

export class Supervisor extends EventEmitter {
  constructor({ manifest, database, artifactRoot, syncCoordinationMailbox = true }) {
    super(); this.manifest = manifest; this.database = database; this.artifactRoot = artifactRoot; this.syncCoordinationMailbox = syncCoordinationMailbox; this.workers = new Map(); this.timer = null; this.stopping = false; this.startedAt = null; this.lastRepairBucket = null; this.lastQueueBucket = null; this.lastSecondaryMailboxBucket = null;
  }

  start() {
    this.stopping = false;
    this.startedAt = new Date().toISOString();
    for (const definition of this.manifest.workers.filter((item) => item.enabled)) this.#spawn(definition);
    this.database.recoverExpired();
    this.#scheduleAutomaticRepair();
    this.#scheduleMicrosoftQueuePoll();
    this.#scheduleSecondaryMailboxMonitor();
    this.timer = setInterval(() => this.#tick(), 500);
    this.timer.unref();
  }

  stop() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.startedAt = null;
    for (const state of this.workers.values()) {
      if (state.currentTaskId) this.database.recoverWorkerTasks(state.definition.id, "supervisor-stopping");
      state.process.send?.({ type: "shutdown" });
    }
    this.workers.clear();
  }

  status() {
    return [...this.workers.entries()].map(([workerId, state]) => ({
      workerId, label: state.definition.label, version: state.definition.version,
      status: state.status ?? (state.ready ? (state.busy ? "busy" : "healthy") : "starting"), pid: state.process.pid,
      restartCount: state.restartCount, lastHeartbeatAt: state.lastHeartbeatAt,
      currentTaskId: state.currentTaskId, currentTaskStartedAt: state.currentTaskStartedAt,
      timeoutMs: state.definition.timeoutMs, capabilities: state.definition.capabilities,
    }));
  }

  health(now = Date.now()) {
    const enabled = this.manifest.workers.filter((worker) => worker.enabled);
    const workers = this.status();
    const unhealthy = enabled.filter((definition) => {
      const state = workers.find((worker) => worker.workerId === definition.id);
      return !state || !["healthy", "busy"].includes(state.status) || !state.lastHeartbeatAt || now - Date.parse(state.lastHeartbeatAt) > this.manifest.runtime.heartbeatTimeoutMs;
    }).map((worker) => worker.id);
    return { supervisorRunning: Boolean(this.startedAt) && !this.stopping, startedAt: this.startedAt, healthy: Boolean(this.startedAt) && !this.stopping && unhealthy.length === 0, unhealthyWorkers: unhealthy };
  }

  restartWorker(workerId) {
    const state = this.workers.get(workerId);
    if (!state) return null;
    if (state.currentTaskId) this.database.recoverWorkerTasks(workerId, "operator-restart");
    this.workers.delete(workerId);
    state.currentTaskId = null;
    state.process.kill();
    this.#spawn(state.definition, 0);
    return this.status().find((item) => item.workerId === workerId) ?? null;
  }

  probeWorker(workerId) {
    const definition = this.manifest.workers.find((item) => item.id === workerId && item.enabled);
    if (!definition) return null;
    return this.database.submitTask({
      capability: definition.healthProbe,
      dataClass: definition.dataClasses[0],
      requestedMode: this.manifest.defaultAutonomyMode,
      executionPlane: definition.executionPlane,
      priority: "high",
      idempotencyKey: `operator-probe:${workerId}:${Date.now()}`,
      requestedOutcome: `Verify ${definition.label} is operational`,
    });
  }

  #spawn(definition, restartCount = 0) {
    const child = fork(WORKER_PROCESS, [definition.id], { stdio: ["ignore", "ignore", "ignore", "ipc"], env: { ...process.env, MAHORAGA_ARTIFACT_ROOT: this.artifactRoot } });
    const state = { definition, process: child, ready: false, busy: false, status: "starting", restartCount,
      lastHeartbeatAt: null, currentTaskId: null, currentTaskStartedAt: null };
    this.workers.set(definition.id, state);
    this.database.setWorkerState({ workerId: definition.id, status: "starting", pid: child.pid, restartCount });
    child.on("message", (message) => this.#safeMessage(state, message));
    child.on("exit", (code) => this.#exit(state, code));
  }

  #safeMessage(state, message) {
    try {
      this.#message(state, message);
    } catch {
      if (message?.taskId) this.database.recoverWorkerTasks(state.definition.id, "supervisor-message-rejected");
      state.status = "crashed";
      state.process.kill();
    }
  }

  #message(state, message) {
    if (this.stopping) return;
    if (message?.type === "ready") {
      state.ready = true; state.status = "healthy"; state.lastHeartbeatAt = new Date().toISOString();
      this.database.setWorkerState({ workerId: state.definition.id, status: "healthy", pid: state.process.pid, restartCount: state.restartCount, lastHeartbeatAt: state.lastHeartbeatAt });
    } else if (message?.type === "heartbeat") {
      state.lastHeartbeatAt = message.timestamp;
      state.status = state.busy ? "busy" : "healthy";
      this.database.setWorkerState({ workerId: state.definition.id, status: state.status, pid: state.process.pid, restartCount: state.restartCount, lastHeartbeatAt: state.lastHeartbeatAt });
    } else if (message?.type === "task.completed") {
      this.#applySecondaryResult(message.taskId, message.result);
      if (message.result?.waitingForUser === true) {
        this.database.waitTaskForUser(message.taskId, normalizeSummary(message.result?.prompt ?? "Additional input is required."));
        this.#release(state);
        return;
      }
      const task = this.database.markVerifying(message.taskId, `${state.definition.id}:${state.definition.version}`);
      if (task?.conversationId) {
        const evaluation = evaluateAnswerQuality({ task, result: message.result ?? {} });
        const alternate = task.attemptCount < task.maximumAttempts
          ? routeTask(this.manifest, { ...task, excludedWorkerIds: [...task.excludedWorkerIds, state.definition.id] }, { workerStates: this.status() })
          : { status: "waiting" };
        const decision = evaluation.accepted
          ? "accepted"
          : task.attemptCount >= task.maximumAttempts
            ? "unresolved"
            : alternate.status === "routable" ? "reroute" : "retry";
        this.database.recordAnswerEvaluation({
          taskId: task.id, attemptNumber: task.attemptCount, evaluatorVersion: ANSWER_EVALUATOR_VERSION,
          decision, reasons: evaluation.reasons, evidence: evaluation.evidence,
        });
        if (decision === "retry" || decision === "reroute") {
          this.database.requeueAfterAnswerEvaluation({
            taskId: task.id, decision, excludedWorkerId: decision === "reroute" ? state.definition.id : null,
          });
          this.#release(state);
          return;
        }
        if (decision === "unresolved") {
          this.database.finishTask(task.id, {
            status: "failed", errorCode: "answer-quality-unresolved",
            resultSummary: unresolvedAnswerSummary(evaluation, task.attemptCount),
          });
          this.#release(state);
          return;
        }
      }
      if (message.result?.verified === false) {
        this.database.finishTask(message.taskId, { status: "failed", errorCode: "verification-failed" });
      } else {
        this.database.finishTask(message.taskId, { status: "completed", resultSummary: normalizeSummary(message.result?.summary), receiptMetadata: message.result?.receiptMetadata ?? {} });
      }
      this.#release(state);
    } else if (message?.type === "task.failed") {
      const failed = this.database.getTask(message.taskId);
      const assignmentId = secondaryAssignmentId(failed, "secondary-validate");
      if (assignmentId) this.database.completeSecondaryValidation({ taskId: failed.id, verified: false });
      this.database.finishTask(message.taskId, { status: "failed", errorCode: message.errorCode });
      this.#release(state);
    }
  }

  #release(state) {
    state.busy = false; state.status = "healthy"; state.currentTaskId = null; state.currentTaskStartedAt = null;
  }

  #exit(state, code) {
    if (this.workers.get(state.definition.id)?.process !== state.process) return;
    this.workers.delete(state.definition.id);
    if (state.currentTaskId) this.database.recoverWorkerTasks(state.definition.id, `worker-exit-${code ?? "unknown"}`);
    const exhausted = state.restartCount >= this.manifest.runtime.maximumWorkerRestarts;
    this.database.setWorkerState({ workerId: state.definition.id, status: this.stopping ? "stopped" : exhausted ? "quarantined" : "crashed", restartCount: state.restartCount, lastErrorCode: `exit-${code ?? "unknown"}` });
    if (!this.stopping && state.restartCount < this.manifest.runtime.maximumWorkerRestarts) {
      const delay = Math.min(1000 * (2 ** state.restartCount), 15000);
      setTimeout(() => { if (!this.stopping) this.#spawn(state.definition, state.restartCount + 1); }, delay).unref();
    }
  }

  #tick() {
    this.database.recoverExpired();
    this.database.reconcileObjectives();
    this.#scheduleAutomaticRepair();
    this.#scheduleMicrosoftQueuePoll();
    this.#scheduleSecondaryMailboxMonitor();
    const now = Date.now();
    for (const state of this.workers.values()) {
      if (state.lastHeartbeatAt && now - Date.parse(state.lastHeartbeatAt) > this.manifest.runtime.heartbeatTimeoutMs) {
        state.status = "hung"; state.process.kill(); continue;
      }
      if (state.busy && state.currentTaskStartedAt && now - Date.parse(state.currentTaskStartedAt) > state.definition.timeoutMs) {
        state.status = "hung"; state.process.kill(); continue;
      }
      if (!state.ready || state.busy) continue;
      const task = this.database.claimNext({ workerId: state.definition.id, capabilities: state.definition.capabilities, leaseMs: this.manifest.runtime.taskLeaseMs });
      if (!task) continue;
      const route = routeTask(this.manifest, task, { workerStates: this.status() });
      if (route.status !== "routable" || route.worker.id !== state.definition.id) {
        this.database.finishTask(task.id, { status: "waiting", errorCode: route.reason ?? "routing-changed" });
        continue;
      }
      state.busy = true; state.status = "busy"; state.currentTaskId = task.id; state.currentTaskStartedAt = new Date().toISOString();
      const envelope = task.conversationId ? { ...task, messages: this.database.listConversationMessages(task.conversationId) } : task;
      state.process.send({ type: "task", taskId: task.id, capability: task.capability, task: envelope });
    }
  }

  #scheduleAutomaticRepair() {
    if (!this.manifest.repair?.enabled) return;
    const bucket = Math.floor(Date.now() / this.manifest.repair.scanIntervalMs);
    if (bucket === this.lastRepairBucket) return;
    this.lastRepairBucket = bucket;
    this.database.submitTask({
      capability: "repair.apply",
      dataClass: "local-only",
      requestedMode: "local",
      idempotencyKey: `automatic-operational-repair:${bucket}`,
    });
  }

  #scheduleMicrosoftQueuePoll() {
    if (!this.manifest.featureFlags?.microsoftQueueWorker) return;
    const worker = this.manifest.workers.find((item) => item.id === "microsoft-queue" && item.enabled);
    if (!worker) return;
    const bucket = Math.floor(Date.now() / this.manifest.queue.pollIntervalMs);
    if (bucket === this.lastQueueBucket) return;
    this.lastQueueBucket = bucket;
    this.database.submitTask({
      capability: "queue.poll", dataClass: "enterprise", requestedMode: "hybrid",
      executionPlane: "licensed-cloud", priority: "critical",
      idempotencyKey: `microsoft-queue-poll:${bucket}`,
    });
  }

  #scheduleSecondaryMailboxMonitor() {
    if (!this.manifest.featureFlags?.secondaryCodexMailbox) return;
    try { if (this.syncCoordinationMailbox) syncCoordinationAssignments(this.database); }
    catch { return; }
    const bucket = Math.floor(Date.now() / 60000);
    if (bucket === this.lastSecondaryMailboxBucket) return;
    this.lastSecondaryMailboxBucket = bucket;
    for (const assignment of this.database.readySecondaryAssignments()) {
      this.database.submitTask({
        capability: "repository.secondary-monitor", dataClass: "synthetic", requestedMode: "local",
        executionPlane: "local", taskType: "secondary-codex", priority: "background", maximumAttempts: 1,
        taskArea: assignment.taskArea, requestedOutcome: `Monitor Secondary Codex mailbox ${assignment.id}.`,
        correlationId: assignment.correlationId, idempotencyKey: `secondary-monitor:${assignment.id}:${bucket}`,
      });
    }
  }

  #applySecondaryResult(taskId, result) {
    if (result?.secondaryMonitor) {
      const assignment = this.database.observeSecondaryReturn(result.secondaryMonitor);
      if (assignment?.status === "RETURNED") {
        const validation = this.database.submitTask({
          capability: "repository.verify", dataClass: "synthetic", requestedMode: "local", executionPlane: "local",
          taskType: "secondary-codex", priority: "high", maximumAttempts: 1, taskArea: assignment.taskArea,
          requestedOutcome: `Validate returned Secondary Codex commit ${assignment.returnCommit.slice(0, 12)} for ${assignment.id}.`,
          correlationId: assignment.correlationId, idempotencyKey: `secondary-validate:${assignment.id}:${assignment.expectedBaseCommit}:${assignment.returnCommit}`,
        });
        this.database.attachSecondaryValidation({ assignmentId: assignment.id, taskId: validation.id });
      }
    }
    if (result?.secondaryValidation) this.database.completeSecondaryValidation({ taskId, verified: result.verified !== false });
  }
}

function secondaryAssignmentId(task, prefix) {
  const match = String(task?.idempotencyKey ?? "").match(new RegExp(`^${prefix}:(sec-[a-f0-9-]+):`));
  return match?.[1] ?? null;
}

export function normalizeSummary(value) {
  const summary = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 2000) : "";
  return summary || "Task completed and verified.";
}
