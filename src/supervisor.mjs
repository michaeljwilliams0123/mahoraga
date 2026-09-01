import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routeTask } from "./router.mjs";
import { ANSWER_EVALUATOR_VERSION, evaluateAnswerQuality, unresolvedAnswerSummary } from "./answer-quality.mjs";
import { syncCoordinationAssignments } from "./coordination-mailbox.mjs";
import { receiptFailure, validateCapabilityReceipt } from "./receipt-registry.mjs";
import { applyAutomaticRepairs, scanRepairState } from "./repair.mjs";

const WORKER_PROCESS = path.join(path.dirname(fileURLToPath(import.meta.url)), "worker-process.mjs");

export class Supervisor extends EventEmitter {
  constructor({ manifest, database, artifactRoot, contentVaultRoot = null, contentVaultKeyFile = null, syncCoordinationMailbox = true, forkWorker = fork, tickIntervalMs = 500 }) {
    super(); this.manifest = manifest; this.database = database; this.artifactRoot = artifactRoot; this.contentVaultRoot = contentVaultRoot; this.contentVaultKeyFile = contentVaultKeyFile;
    this.syncCoordinationMailbox = syncCoordinationMailbox; this.forkWorker = forkWorker; this.tickIntervalMs = tickIntervalMs;
    this.workers = new Map(); this.timer = null; this.stopping = false; this.startedAt = null;
    this.lastRepairScanAt = null; this.lastRepairScanHealthy = null; this.lastRepairChecked = 0; this.nextRepairScanAt = 0; this.repairScanInFlight = false;
    this.lastRepairBucket = null; this.lastQueueBucket = null; this.lastSecondaryMailboxBucket = null;
  }

  start() {
    this.stopping = false;
    this.startedAt = new Date().toISOString();
    for (const worker of this.database.listWorkerState()) {
      this.database.setWorkerState({
        workerId: worker.workerId, status: "stale", pid: null, restartCount: worker.restartCount,
        lastErrorCode: "process-not-live", lastErrorDetail: "No live worker process was observed when the supervisor started.",
      });
    }
    for (const definition of this.manifest.workers.filter((item) => item.enabled)) this.#spawn(definition);
    this.database.recoverExpired();
    this.#scheduleRepairIncidentScan(true);
    this.#scheduleMicrosoftQueuePoll();
    this.#scheduleSecondaryMailboxMonitor();
    this.timer = setInterval(() => this.#tick(), this.tickIntervalMs);
    this.timer.unref();
  }

  stop() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.startedAt = null;
    for (const state of this.workers.values()) {
      const observedAt = new Date().toISOString();
      this.#setProcessReadiness(state, "stopped", observedAt);
      this.database.setWorkerState({ workerId: state.definition.id, status: "stopped", pid: null, restartCount: state.restartCount, lastHeartbeatAt: state.lastHeartbeatAt });
      if (state.currentTaskId) this.database.recoverWorkerTasks(state.definition.id, "supervisor-stopping");
      state.process?.send?.({ type: "shutdown" });
    }
    this.workers.clear();
  }

  status() {
    return [...this.workers.entries()].map(([workerId, state]) => {
      const readiness = this.database.listCapabilityReadiness(workerId);
      return {
        workerId, label: state.definition.label, version: state.definition.version,
        status: state.status ?? (state.busy ? "busy" : state.ready ? "live" : "starting"), pid: state.process?.pid ?? null,
        restartCount: state.restartCount, lastHeartbeatAt: state.lastHeartbeatAt,
        currentTaskId: state.currentTaskId, currentTaskStartedAt: state.currentTaskStartedAt,
        timeoutMs: state.definition.timeoutMs, capabilities: state.definition.capabilities, readiness,
        lastErrorCode: state.lastErrorCode ?? null, lastErrorDetail: state.lastErrorDetail ?? null,
      };
    });
  }

  health(now = Date.now()) {
    const enabled = this.manifest.workers.filter((worker) => worker.enabled);
    const workers = this.status();
    const unhealthy = enabled.filter((definition) => {
      const state = workers.find((worker) => worker.workerId === definition.id);
      return !state || !["live", "busy"].includes(state.status) || !state.lastHeartbeatAt || now - Date.parse(state.lastHeartbeatAt) > this.manifest.runtime.heartbeatTimeoutMs;
    }).map((worker) => worker.id);
    const activeIncidents = this.database.listRepairIncidents({ includeResolved: false }).length;
    return {
      supervisorRunning: Boolean(this.startedAt) && !this.stopping, startedAt: this.startedAt,
      healthy: Boolean(this.startedAt) && !this.stopping && unhealthy.length === 0,
      unhealthyWorkers: unhealthy,
      repairScan: { lastVerifiedAt: this.lastRepairScanAt, healthy: this.lastRepairScanHealthy, checked: this.lastRepairChecked, inProgress: this.repairScanInFlight, activeIncidents },
    };
  }

  restartWorker(workerId) {
    const state = this.workers.get(workerId);
    if (!state) return null;
    if (state.currentTaskId) this.database.recoverWorkerTasks(workerId, "operator-restart");
    this.workers.delete(workerId);
    state.currentTaskId = null;
    state.process?.kill?.();
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
    let child;
    try {
      child = this.forkWorker(WORKER_PROCESS, [definition.id], { execArgv: [], stdio: ["ignore", "ignore", "pipe", "ipc"], env: {
        ...process.env,
        MAHORAGA_ARTIFACT_ROOT: this.artifactRoot,
        MAHORAGA_CONTENT_VAULT_ROOT: this.contentVaultRoot ?? undefined,
        MAHORAGA_CONTENT_VAULT_KEY_FILE: this.contentVaultKeyFile ?? undefined,
      } });
    } catch (error) {
      this.#spawnFailure(definition, restartCount, error);
      return;
    }
    const state = { definition, process: child, ready: false, busy: false, status: "starting", restartCount,
      lastHeartbeatAt: null, currentTaskId: null, currentTaskStartedAt: null, stderrTail: "", lastErrorCode: null, lastErrorDetail: null,
      spawned: false, terminating: false, terminated: false };
    this.workers.set(definition.id, state);
    for (const capability of definition.capabilities) this.database.setCapabilityReadiness({
      workerId: definition.id, capability, processStatus: "starting", providerStatus: "unknown", canaryStatus: "never",
    });
    this.database.setWorkerState({ workerId: definition.id, status: "starting", pid: child.pid, restartCount });
    child.stderr?.on?.("data", (chunk) => {
      state.stderrTail = sanitizeWorkerDiagnostic(`${state.stderrTail} ${String(chunk)}`);
    });
    child.on("spawn", () => { state.spawned = true; });
    child.on("message", (message) => this.#safeMessage(state, message));
    child.on("error", (error) => this.#processError(state, error));
    child.on("exit", (code, signal) => this.#exit(state, code, signal));
  }

  #safeMessage(state, message) {
    try {
      this.#message(state, message);
    } catch (error) {
      if (message?.taskId) this.database.recoverWorkerTasks(state.definition.id, "supervisor-message-rejected");
      state.lastErrorCode = "supervisor-message-rejected";
      state.lastErrorDetail = sanitizeWorkerDiagnostic(error);
      state.status = "crashed";
      state.process.kill();
    }
  }

  #message(state, message) {
    if (this.stopping) return;
    if (message?.type === "process.ready") {
      state.status = "live"; state.lastHeartbeatAt = new Date().toISOString();
      this.database.setWorkerState({ workerId: state.definition.id, status: "live", pid: state.process.pid, restartCount: state.restartCount, lastHeartbeatAt: state.lastHeartbeatAt });
      this.#setProcessReadiness(state, "live", state.lastHeartbeatAt);
    } else if (message?.type === "provider.readiness") {
      const observedAt = message.observedAt ?? new Date().toISOString();
      let providerStatus = "unavailable"; let canaryStatus = "failed"; let canaryVerifiedAt = null; let executionCellCanary = null;
      try {
        const receipt = validateCapabilityReceipt(state.definition.healthProbe, message.receipt);
        providerStatus = receipt.outcome === "succeeded" ? "ready" : "unavailable";
        canaryStatus = receipt.outcome === "succeeded" ? "verified" : "failed";
        canaryVerifiedAt = receipt.outcome === "succeeded" ? observedAt : null;
        executionCellCanary = receipt.details.providerEvidence.executionCellCanary ?? null;
      } catch {}
      for (const capability of state.definition.capabilities) {
        const exactCanary = capability === state.definition.healthProbe || (capability === "codex.execute" && executionCellCanary === "verified");
        this.database.setCapabilityReadiness({
          workerId: state.definition.id, capability, processStatus: "live", providerStatus,
          canaryStatus: exactCanary ? canaryStatus : "never",
          processObservedAt: state.lastHeartbeatAt, providerObservedAt: observedAt,
          canaryVerifiedAt: exactCanary ? canaryVerifiedAt : null,
          lastErrorCode: providerStatus === "ready" ? null : message.errorCode ?? "provider-probe-failed",
        });
      }
      state.status = "live";
    } else if (message?.type === "capability.canary") {
      if (!state.definition.capabilities.includes(message.capability)) throw new Error("capability-canary-unknown");
      const observedAt = message.observedAt ?? new Date().toISOString();
      const previous = this.database.listCapabilityReadiness(state.definition.id).find((item) => item.capability === message.capability);
      let canaryStatus = "failed"; let canaryVerifiedAt = null;
      try {
        const receipt = validateCapabilityReceipt(message.capability, message.receipt);
        if (receipt.outcome === "succeeded") { canaryStatus = "verified"; canaryVerifiedAt = observedAt; }
      } catch {}
      this.database.setCapabilityReadiness({
        workerId: state.definition.id, capability: message.capability, processStatus: "live",
        providerStatus: previous?.providerStatus ?? "unknown", canaryStatus,
        processObservedAt: state.lastHeartbeatAt, providerObservedAt: previous?.providerObservedAt ?? observedAt,
        canaryVerifiedAt, lastErrorCode: canaryStatus === "verified" ? null : message.errorCode ?? "capability-canary-failed",
      });
    } else if (message?.type === "readiness.complete") {
      state.ready = true; state.status = "live";
    } else if (message?.type === "heartbeat") {
      state.lastHeartbeatAt = message.timestamp;
      state.status = state.busy ? "busy" : "live";
      this.database.setWorkerState({ workerId: state.definition.id, status: state.status, pid: state.process.pid, restartCount: state.restartCount, lastHeartbeatAt: state.lastHeartbeatAt });
      this.#setProcessReadiness(state, state.status, state.lastHeartbeatAt);
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
      try {
        const receipt = validateCapabilityReceipt(task.capability, message.result?.receipt);
        if (task.capability === "codex.execute") {
          this.database.recordCodexBuilderExecution({ taskId: task.id, outcome: receipt.outcome, evidence: receipt.details.providerEvidence });
        }
        this.database.completeTaskWithReceipt(message.taskId, receipt, {
          conversationContent: task.capability === "assistant.respond" && typeof message.result?.answer === "string"
            ? message.result.answer
            : null,
        });
      } catch (error) {
        const failure = receiptFailure(error);
        this.database.failTaskSafely(message.taskId, { errorCode: failure.errorCode, resultSummary: failure.boundedSummary });
      } finally {
        this.#release(state);
      }
    } else if (message?.type === "task.failed") {
      const failed = this.database.getTask(message.taskId);
      const assignmentId = secondaryAssignmentId(failed, "secondary-validate");
      if (assignmentId) this.database.completeSecondaryValidation({ taskId: failed.id, verified: false });
      this.database.failTaskSafely(message.taskId, { errorCode: message.errorCode });
      this.#release(state);
    }
  }

  #release(state) {
    state.busy = false; state.status = "live"; state.currentTaskId = null; state.currentTaskStartedAt = null;
    this.#setProcessReadiness(state, "live", new Date().toISOString());
  }

  #setProcessReadiness(state, processStatus, observedAt) {
    const current = new Map(this.database.listCapabilityReadiness(state.definition.id).map((item) => [item.capability, item]));
    for (const capability of state.definition.capabilities) {
      const previous = current.get(capability);
      this.database.setCapabilityReadiness({
        workerId: state.definition.id, capability, processStatus,
        providerStatus: previous?.providerStatus ?? "unknown", canaryStatus: previous?.canaryStatus ?? "never",
        processObservedAt: observedAt, providerObservedAt: previous?.providerObservedAt ?? null,
        canaryVerifiedAt: previous?.canaryVerifiedAt ?? null, lastErrorCode: previous?.lastErrorCode ?? null,
      });
    }
  }

  #spawnFailure(definition, restartCount, error) {
    const exhausted = restartCount >= this.manifest.runtime.maximumWorkerRestarts;
    const errorCode = `spawn-${safeErrorCode(error)}`;
    const errorDetail = sanitizeWorkerDiagnostic(error);
    const state = {
      definition, process: null, ready: false, busy: false, status: exhausted ? "quarantined" : "crashed",
      restartCount, lastHeartbeatAt: null, currentTaskId: null, currentTaskStartedAt: null,
      stderrTail: "", lastErrorCode: errorCode, lastErrorDetail: errorDetail,
      spawned: false, terminating: false, terminated: true,
    };
    if (exhausted) this.workers.set(definition.id, state);
    this.database.setWorkerState({
      workerId: definition.id, status: state.status, pid: null, restartCount,
      lastErrorCode: errorCode, lastErrorDetail: errorDetail,
    });
    if (!this.stopping && !exhausted) {
      const delay = Math.min(1000 * (2 ** restartCount), 15000);
      setTimeout(() => { if (!this.stopping) this.#spawn(definition, restartCount + 1); }, delay).unref();
    }
  }

  #processError(state, error) {
    if (this.workers.get(state.definition.id)?.process !== state.process || state.terminated || state.terminating) return;
    if (!state.spawned) {
      this.#exit(state, null, null, error);
      return;
    }
    state.terminating = true;
    if (state.currentTaskId) this.database.recoverWorkerTasks(state.definition.id, "worker-process-error");
    state.ready = false; state.busy = false; state.currentTaskId = null; state.currentTaskStartedAt = null;
    state.status = "crashed"; state.lastErrorCode = `process-${safeErrorCode(error)}`;
    state.lastErrorDetail = sanitizeWorkerDiagnostic(error);
    this.database.setWorkerState({
      workerId: state.definition.id, status: state.status, pid: state.process?.pid ?? null, restartCount: state.restartCount,
      lastErrorCode: state.lastErrorCode, lastErrorDetail: state.lastErrorDetail,
    });
    try {
      state.process?.kill?.();
    } catch (killError) {
      state.status = "quarantined";
      state.lastErrorCode = `kill-${safeErrorCode(killError)}`;
      state.lastErrorDetail = sanitizeWorkerDiagnostic(killError);
      this.database.setWorkerState({
        workerId: state.definition.id, status: state.status, pid: state.process?.pid ?? null, restartCount: state.restartCount,
        lastErrorCode: state.lastErrorCode, lastErrorDetail: state.lastErrorDetail,
      });
    }
  }

  #exit(state, code, signal = null, error = null) {
    if (this.workers.get(state.definition.id)?.process !== state.process || state.terminated) return;
    state.terminated = true;
    if (state.currentTaskId) this.database.recoverWorkerTasks(state.definition.id, `worker-exit-${code ?? "unknown"}`);
    const exhausted = state.restartCount >= this.manifest.runtime.maximumWorkerRestarts;
    const errorCode = state.lastErrorCode ?? (error ? `spawn-${safeErrorCode(error)}` : signal ? `signal-${signal}` : `exit-${code ?? "unknown"}`);
    const errorDetail = state.lastErrorDetail ?? (state.stderrTail || sanitizeWorkerDiagnostic(error ?? `Worker exited with ${errorCode}.`));
    state.ready = false; state.busy = false; state.currentTaskId = null; state.currentTaskStartedAt = null;
    state.status = this.stopping ? "stopped" : exhausted ? "quarantined" : "crashed";
    state.lastErrorCode = errorCode; state.lastErrorDetail = errorDetail;
    this.#setProcessReadiness(state, state.status, new Date().toISOString());
    this.database.setWorkerState({
      workerId: state.definition.id, status: state.status, pid: null, restartCount: state.restartCount,
      lastErrorCode: errorCode, lastErrorDetail: errorDetail,
    });
    if (!this.stopping && !exhausted) {
      this.workers.delete(state.definition.id);
      const delay = Math.min(1000 * (2 ** state.restartCount), 15000);
      setTimeout(() => { if (!this.stopping) this.#spawn(state.definition, state.restartCount + 1); }, delay).unref();
    }
  }

  #tick() {
    this.database.recoverExpired();
    this.database.reconcileObjectives();
    this.#scheduleRepairIncidentScan();
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
      let executionTask = task;
      if (task.capability === "codex.execute") {
        const integrationLease = this.database.getIntegrationLease();
        const session = this.database.getCodexBuilderSessionByTaskId(task.id);
        if (!integrationLease || integrationLease.leaseId !== task.integrationLeaseId || !session || session.status !== "PREPARED") {
          this.database.finishTask(task.id, { status: "waiting", errorCode: !integrationLease ? "integration-lease-not-active" : !session ? "codex-builder-session-missing" : "codex-builder-session-invalid" });
          continue;
        }
        executionTask = { ...task, integrationLease, executionSessionId: session.executionSessionId };
      }
      state.busy = true; state.status = "busy"; state.currentTaskId = task.id; state.currentTaskStartedAt = new Date().toISOString();
      const envelope = task.conversationId ? { ...executionTask, messages: this.database.listConversationMessagesForExecution(task.conversationId) } : executionTask;
      state.process.send({ type: "task", taskId: task.id, capability: task.capability, task: envelope });
    }
  }

  #scheduleRepairIncidentScan(force = false) {
    if (!this.manifest.repair?.enabled || this.repairScanInFlight || this.stopping) return;
    const current = Date.now();
    if (!force && current < this.nextRepairScanAt) return;
    this.nextRepairScanAt = current + this.manifest.repair.scanIntervalMs;
    this.repairScanInFlight = true;
    void this.#runRepairIncidentScan().catch(() => {
      this.lastRepairScanAt = new Date().toISOString();
      this.lastRepairScanHealthy = false;
    }).finally(() => { this.repairScanInFlight = false; });
  }

  async #runRepairIncidentScan() {
    const scan = await scanRepairState(this.manifest);
    this.lastRepairScanAt = new Date().toISOString();
    this.lastRepairScanHealthy = scan.healthy;
    this.lastRepairChecked = scan.checked;
    const reconciled = this.database.reconcileRepairIncidents(scan.issues, scan.baselineVersion, new Date(this.lastRepairScanAt));
    const recoverable = reconciled.events
      .filter((event) => event.type === "repair-incident-opened" && event.incident.condition === "live-file-missing-or-empty" && event.incident.expectedSha256)
      .map((event) => event.incident);
    if (recoverable.length === 0 || !this.manifest.repair.automaticRiskClasses.includes("core")) return;
    for (const incident of recoverable) this.database.transitionRepairIncident(incident.id, "recovery-attempted");
    let recovery;
    try {
      recovery = await applyAutomaticRepairs(this.manifest);
    } catch {
      for (const incident of recoverable) this.database.transitionRepairIncident(incident.id, "recovery-failed", { errorCode: "automatic-repair-failed" });
      return;
    }
    for (const incident of recoverable) {
      if (recovery.repaired.includes(incident.relative)) this.database.transitionRepairIncident(incident.id, "recovery-verified");
      else if (recovery.rolledBack.includes(incident.relative)) this.database.transitionRepairIncident(incident.id, "recovery-rolled-back", { errorCode: "repair-rolled-back" });
      else this.database.transitionRepairIncident(incident.id, "recovery-failed", { errorCode: "repair-unresolved" });
    }
    const verified = await scanRepairState(this.manifest);
    this.lastRepairScanAt = new Date().toISOString(); this.lastRepairScanHealthy = verified.healthy; this.lastRepairChecked = verified.checked;
    this.database.reconcileRepairIncidents(verified.issues, verified.baselineVersion, new Date(this.lastRepairScanAt));
  }

  #scheduleMicrosoftQueuePoll() {
    if (!this.manifest.featureFlags?.microsoftQueueWorker) return;
    const worker = this.manifest.workers.find((item) => item.id === "microsoft-queue" && item.enabled);
    if (!worker) return;
    const task = {
      capability: "queue.poll", dataClass: "enterprise", requestedMode: "hybrid",
      executionPlane: "licensed-cloud", priority: "critical",
    };
    if (!this.#canSchedule(task)) return;
    const bucket = Math.floor(Date.now() / this.manifest.queue.pollIntervalMs);
    if (bucket === this.lastQueueBucket) return;
    this.lastQueueBucket = bucket;
    this.database.submitTask({ ...task, idempotencyKey: `microsoft-queue-poll:${bucket}` });
  }

  #scheduleSecondaryMailboxMonitor() {
    if (!this.manifest.featureFlags?.secondaryCodexMailbox) return;
    const task = {
      capability: "repository.secondary-monitor", dataClass: "synthetic", requestedMode: "local",
      executionPlane: "local", taskType: "secondary-codex", priority: "background", maximumAttempts: 1,
    };
    if (!this.#canSchedule(task)) return;
    try { if (this.syncCoordinationMailbox) syncCoordinationAssignments(this.database); }
    catch { return; }
    const bucket = Math.floor(Date.now() / 60000);
    if (bucket === this.lastSecondaryMailboxBucket) return;
    this.lastSecondaryMailboxBucket = bucket;
    for (const assignment of this.database.readySecondaryAssignments()) {
      this.database.submitTask({
        ...task, taskArea: assignment.taskArea, requestedOutcome: `Monitor Secondary Codex mailbox ${assignment.id}.`,
        correlationId: assignment.correlationId, idempotencyKey: `secondary-monitor:${assignment.id}:${bucket}`,
      });
    }
  }

  #canSchedule(task) {
    const route = routeTask(this.manifest, { ...task, excludedWorkerIds: [] }, { workerStates: this.status() });
    if (route.status !== "routable") return false;
    const state = this.workers.get(route.worker.id);
    const heartbeatAge = state?.lastHeartbeatAt ? Date.now() - Date.parse(state.lastHeartbeatAt) : Number.POSITIVE_INFINITY;
    if (!state?.ready || !["live", "busy"].includes(state.status) || heartbeatAge > this.manifest.runtime.heartbeatTimeoutMs) return false;
    return !this.database.hasActiveTask(task.capability);
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

function safeErrorCode(error) {
  const code = typeof error?.code === "string" ? error.code : "error";
  return code.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 40) || "error";
}

export function sanitizeWorkerDiagnostic(value) {
  const diagnostic = value instanceof Error ? `${value.name}: ${value.message}` : String(value ?? "");
  const digest = createHash("sha256").update(diagnostic).digest("hex").slice(0, 16);
  const summary =
    /ERR_MODULE_NOT_FOUND|Cannot find (?:module|package)|module import/i.test(diagnostic) ? "Worker module import failed." :
    /SyntaxError|Unexpected token/i.test(diagnostic) ? "Worker source failed to parse." :
    /ENOENT|entrypoint.*not found|not found.*entrypoint/i.test(diagnostic) ? "Worker entrypoint was not found." :
    /EACCES|EPERM|permission denied/i.test(diagnostic) ? "Worker process permission failure." :
    /IPC|channel.*closed/i.test(diagnostic) ? "Worker IPC channel reported an error." :
    /timeout|timed out/i.test(diagnostic) ? "Worker process timed out." :
    "Worker process reported diagnostic output.";
  return `${summary} Sensitive diagnostic content redacted. Diagnostic ${digest}.`;
}
