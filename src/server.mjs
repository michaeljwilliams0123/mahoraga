import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./config.mjs";
import { capabilityIndex } from "./router.mjs";
import { randomUUID } from "node:crypto";
import { bearerMatches } from "./local-auth.mjs";
import { observeWorldState } from "./world-state-observer.mjs";
import { COORDINATION_PRIVACY } from "./coordination-records.mjs";
import { secondaryRunnerSnapshot } from "./secondary-runner-status.mjs";

const WEB_ROOT = path.join(ROOT, "web");
const STATIC = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/discourse.css", ["discourse.css", "text/css; charset=utf-8"]],
  ["/control.css", ["control.css", "text/css; charset=utf-8"]],
]);

export function snapshotStaticAssets(webRoot = WEB_ROOT) {
  return new Map([...STATIC].map(([route, [file, contentType]]) => [route, {
    body: readFileSync(path.join(webRoot, file)),
    contentType,
  }]));
}

export function createControlServer({ manifest, database, supervisor, primaryCodexToken, webRoot = WEB_ROOT }) {
  const staticAssets = snapshotStaticAssets(webRoot);
  return createServer(async (request, response) => {
    try {
      setHeaders(response, manifest);
      const url = new URL(request.url, `http://${manifest.runtime.host}:${manifest.runtime.port}`);
      if (request.method === "GET" && staticAssets.has(url.pathname)) return staticFile(response, staticAssets.get(url.pathname));
      if (request.method === "GET" && url.pathname === "/api/status") return json(response, 200, statusPayload(manifest, database, supervisor));
      if (request.method === "GET" && url.pathname === "/api/coordination") return json(response, 200, coordinationPayload(manifest, database));
      if (request.method === "POST" && url.pathname === "/api/intake/primary-codex") {
        if (!bearerMatches(request, primaryCodexToken)) return json(response, 401, { error: "primary-codex-token-required" });
        const body = await bodyJson(request);
        const correlationId = body.correlationId ?? body.idempotencyKey ?? `pcx-${randomUUID()}`;
        const task = submitTask(database, manifest, { ...body, correlationId, executionPlane: "primary-codex-local", taskType: body.taskType ?? "primary-codex" });
        return json(response, 202, { receipt: database.recordReceipt({ task, phase: "accepted", verifier: "primary-codex-intake", summary: "Authenticated Primary Codex assignment accepted." }), task });
      }
      if (request.method === "POST" && url.pathname === "/api/intake/primary-codex/objectives") {
        if (!bearerMatches(request, primaryCodexToken)) return json(response, 401, { error: "primary-codex-token-required" });
        const body = await bodyJson(request);
        const objective = database.createObjective({ title: body.title, correlationId: body.correlationId, maximumReplans: body.maximumReplans ?? 2, tasks: body.tasks });
        return json(response, 202, { objective });
      }
      if (request.method === "POST" && url.pathname === "/api/intake/primary-codex/builder") {
        if (!bearerMatches(request, primaryCodexToken)) return json(response, 401, { error: "primary-codex-token-required" });
        const body = await bodyJson(request);
        const correlationId = body.correlationId ?? body.idempotencyKey ?? `pcx-builder-${randomUUID()}`;
        const task = submitTask(database, manifest, builderIntakeBody(body, correlationId));
        const session = database.createCodexBuilderSession({ taskId: task.id, authoritySessionId: body.authoritySessionId ?? null });
        return json(response, 202, { session, receipt: database.recordReceipt({ task, phase: "prepared", verifier: "primary-codex-builder-intake", summary: "Task-scoped Codex Builder assignment prepared; direct execution remains disabled." }), task });
      }
      const builderResult = url.pathname.match(/^\/api\/intake\/primary-codex\/builder\/(cbs-[a-f0-9-]+)\/result$/);
      if (request.method === "POST" && builderResult) {
        if (!bearerMatches(request, primaryCodexToken)) return json(response, 401, { error: "primary-codex-token-required" });
        const body = await bodyJson(request);
        return json(response, 200, { session: database.recordCodexBuilderResult({ sessionId: builderResult[1], status: body.status, verificationState: body.verificationState, changedFileCount: body.changedFileCount, commitId: body.commitId ?? null }) });
      }
      if (request.method === "POST" && url.pathname === "/api/intake/primary-codex/secondary-codex") {
        if (!bearerMatches(request, primaryCodexToken)) return json(response, 401, { error: "primary-codex-token-required" });
        const body = await bodyJson(request);
        return json(response, 202, { assignment: database.createSecondaryAssignment({ title: body.title, taskArea: body.taskArea, expectedTask: body.expectedTask, expectedBaseCommit: body.expectedBaseCommit, correlationId: body.correlationId, allowedPaths: body.allowedPaths }) });
      }
      if (request.method === "GET" && url.pathname === "/api/intake/primary-codex/secondary-codex") {
        if (!bearerMatches(request, primaryCodexToken)) return json(response, 401, { error: "primary-codex-token-required" });
        return json(response, 200, { assignments: database.listSecondaryAssignments() });
      }
      if (request.method === "GET" && url.pathname === "/api/objectives") return json(response, 200, { objectives: database.listObjectives() });
      if (request.method === "GET" && url.pathname === "/api/tasks") return json(response, 200, { tasks: database.listTasks() });
      if (request.method === "GET" && url.pathname === "/api/events") return json(response, 200, { events: database.listEvents() });
      if (request.method === "GET" && url.pathname === "/api/improvements") return json(response, 200, { improvements: database.listImprovements() });
      if (request.method === "GET" && url.pathname === "/api/diagnostics") return json(response, 200, {
        generatedAt: new Date().toISOString(), workers: database.listWorkerState(), events: database.listEvents(300),
      });
      if (request.method === "GET" && url.pathname === "/api/world-state") return json(response, 200, await observeWorldState({ manifest, database, supervisor }));
      if (request.method === "GET" && url.pathname === "/api/conversations") return json(response, 200, { conversations: database.listConversations() });
      if (request.method === "POST" && url.pathname === "/api/conversations") {
        const body = await bodyJson(request);
        return json(response, 201, { conversation: database.createConversation({ title: body.title, initialMessage: body.initialMessage ?? null }) });
      }
      const conversationMessages = url.pathname.match(/^\/api\/conversations\/(con-[a-f0-9-]+)\/messages$/);
      if (request.method === "GET" && conversationMessages) return json(response, 200, { messages: database.listConversationMessages(conversationMessages[1]) });
      if (request.method === "POST" && conversationMessages) {
        const body = await bodyJson(request);
        return json(response, 201, { message: database.addConversationMessage({ conversationId: conversationMessages[1], taskId: body.taskId ?? null, role: body.role ?? "user", content: body.content, requiresResponse: body.requiresResponse ?? false }) });
      }
      if (request.method === "POST" && url.pathname === "/api/tasks") {
        const body = await bodyJson(request);
        const task = submitTask(database, manifest, body);
        return json(response, 202, { task });
      }
      const taskInput = url.pathname.match(/^\/api\/tasks\/(mhg-[a-f0-9-]+)\/input$/);
      if (request.method === "POST" && taskInput) {
        const body = await bodyJson(request);
        return json(response, 200, { task: database.resumeTaskWithInput(taskInput[1], body.content) });
      }
      const taskAction = url.pathname.match(/^\/api\/tasks\/(mhg-[a-f0-9-]+)\/(retry|cancel)$/);
      if (request.method === "POST" && taskAction) {
        const task = taskAction[2] === "retry" ? database.retryTask(taskAction[1]) : database.cancelTask(taskAction[1]);
        if (!task) return json(response, 404, { error: "task-not-found" });
        return json(response, 200, { task });
      }
      const workerAction = url.pathname.match(/^\/api\/workers\/([a-z][a-z0-9-]{0,63})\/(restart|probe)$/);
      if (request.method === "POST" && workerAction) {
        const result = workerAction[2] === "restart" ? supervisor.restartWorker(workerAction[1]) : supervisor.probeWorker(workerAction[1]);
        if (!result) return json(response, 404, { error: "worker-not-found-or-disabled" });
        return json(response, 202, { [workerAction[2] === "restart" ? "worker" : "task"]: result });
      }
      if (request.method === "POST" && url.pathname === "/api/improvements") {
        const body = await bodyJson(request);
        return json(response, 202, { improvement: database.proposeImprovement(body) });
      }
      const decision = url.pathname.match(/^\/api\/improvements\/(imp-[a-f0-9-]+)\/decision$/);
      if (request.method === "POST" && decision) {
        const body = await bodyJson(request);
        if (request.headers["x-mahoraga-approval"] !== decision[1]) return json(response, 403, { error: "explicit-user-approval-required" });
        return json(response, 200, { improvement: database.decideImprovement(decision[1], body.decision) });
      }
      json(response, 404, { error: "not-found" });
    } catch (error) {
      if (error?.code === "idempotency-conflict") return json(response, 409, { error: "idempotency-conflict" });
      json(response, 400, { error: classify(error) });
    }
  });
}

export function statusPayload(manifest, database, supervisor) {
  const tasks = database.listTasks();
  const workers = supervisor.status();
  return {
    product: manifest.product, version: manifest.version, versions: manifest.versions, phase: manifest.phase,
    controlCenterApi: {
      protocolVersion: 1,
      runtimeVersion: manifest.version,
      controlCenterVersion: manifest.versions.controlCenter,
      assetSetId: `${manifest.version}:${manifest.versions.controlCenter}`,
      staticAssetsSnapshotted: true,
    },
    environment: manifest.environment, featureFlags: manifest.featureFlags, queue: manifest.queue,
    updateAuthority: manifest.updateAuthority, autonomyMode: manifest.defaultAutonomyMode, routingPolicy: manifest.routingPolicy,
    repairPolicy: {
      enabled: manifest.repair.enabled,
      automaticRiskClasses: manifest.repair.automaticRiskClasses,
      coreUpdateAuthority: manifest.repair.coreUpdateAuthority,
      scanIntervalMs: manifest.repair.scanIntervalMs,
    },
    runtime: { host: manifest.runtime.host, port: manifest.runtime.port, ...supervisor.health() },
    taskCounts: Object.fromEntries(["queued", "claimed", "running", "verifying", "waiting", "waiting_for_user", "completed", "failed", "cancelled"].map((state) => [state, tasks.filter((task) => task.status === state).length])),
    workers, capabilities: capabilityIndex(manifest, workers), connections: manifest.connections,
    improvementsAwaitingUser: database.listImprovements().filter((item) => item.status === "proposed").length,
    conversations: { active: database.listConversations().filter((item) => item.status === "active").length },
    objectives: database.listObjectives(100),
  };
}

export function coordinationPayload(manifest, database) {
  const assignments = database.listSecondaryAssignments(500);
  const count = (status) => assignments.filter((assignment) => assignment.status === status).length;
  const latestActivityAt = assignments.reduce((latest, assignment) => {
    const value = assignment.updatedAt ?? assignment.createdAt;
    return !latest || Date.parse(value) > Date.parse(latest) ? value : latest;
  }, null);
  const validated = count("VALIDATED");
  const active = count("RETURNED") + count("VALIDATING");
  return {
    generatedAt: new Date().toISOString(),
    state: validated > 0 ? "validated" : active > 0 ? "return-detected" : assignments.length > 0 ? "monitoring" : "idle",
    latestActivityAt,
    transport: {
      kind: "github-repository-mailbox",
      outboundOnly: true,
      pollIntervalMs: 60000,
      returnBranchPrefix: "secondary/",
      enabled: manifest.featureFlags?.secondaryCodexMailbox === true,
    },
    authority: {
      model: "primary-led-subordinate-workers",
      primary: "main-codex",
      secondary: "secondary-codex",
      rolesAreTransportOnly: false,
      authorizedControllers: ["main-codex"],
      primaryIntegrationAuthority: true,
      secondaryCanCreateAssignments: false,
      secondaryCanImplement: true,
      secondaryCanReview: true,
      secondaryCanMerge: false,
      secondaryBranchPrefix: "secondary/",
      integrationRequiresVerification: true,
    },
    automation: {
      mode: "github-native-deterministic",
      modelInvocation: "explicit-task-only",
      idlePollingInvokesModel: false,
      actionReferences: "immutable-commit-sha",
      controls: ["verify", "codeql", "dependabot", "secret-scanning", "push-protection"],
    },
    privacy: { ...COORDINATION_PRIVACY },
    runner: secondaryRunnerSnapshot(),
    counts: {
      total: assignments.length,
      ready: count("READY"),
      returned: count("RETURNED"),
      validating: count("VALIDATING"),
      validated,
      rejected: count("REJECTED"),
    },
    assignments: assignments.map((assignment) => ({
      assignmentId: assignment.id,
      taskArea: assignment.taskArea,
      status: assignment.status,
      source: assignment.source,
      returnBranch: assignment.returnBranch,
      verificationState: assignment.verificationState,
      updatedAt: assignment.updatedAt,
    })),
  };
}

function submitTask(database, manifest, body) {
  const existing = body.idempotencyKey ? database.getTaskByIdempotencyKey(body.idempotencyKey) : null;
  let conversationId;
  if (body.conversationId === false) conversationId = null;
  else if (body.conversationId !== undefined) conversationId = body.conversationId;
  else if (existing) conversationId = existing.conversationId;
  else conversationId = database.createConversation({
      title: body.requestedOutcome ?? body.capability,
      initialMessage: body.initialMessage ?? `Run ${body.capability}`,
    }).id;
  return database.submitTask({
    capability: body.capability, dataClass: body.dataClass ?? "synthetic",
    requestedMode: body.requestedMode ?? manifest.defaultAutonomyMode, idempotencyKey: body.idempotencyKey,
    correlationId: body.correlationId, taskType: body.taskType, requestedOutcome: body.requestedOutcome,
    executionPlane: body.executionPlane ?? "local", priority: body.priority ?? "normal",
    maximumAttempts: body.maximumAttempts ?? manifest.queue.maximumAttempts, conversationId,
    taskArea: body.taskArea ?? "general", excludedWorkerIds: body.excludedWorkerIds ?? [],
  });
}

export function builderIntakeBody(body, correlationId) {
  return {
    capability: "codex.execute", dataClass: "synthetic", requestedMode: body.requestedMode ?? "hybrid",
    idempotencyKey: body.idempotencyKey, correlationId, taskType: "codex-builder",
    requestedOutcome: body.requestedOutcome, executionPlane: "primary-codex-local",
    priority: body.priority ?? "normal", maximumAttempts: 1, taskArea: body.taskArea ?? "codex-builder",
    conversationId: false,
  };
}

function setHeaders(response, manifest) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  response.setHeader("X-Mahoraga-Runtime-Version", manifest.version);
  response.setHeader("X-Mahoraga-Control-Center-Version", manifest.versions.controlCenter);
}
function staticFile(response, asset) { response.writeHead(200, { "Content-Type": asset.contentType }); response.end(asset.body); }
function json(response, status, value) { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify(value)); }
async function bodyJson(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 16384) throw new Error("request-too-large"); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function classify(error) {
  if (error instanceof SyntaxError) return "invalid-json";
  if (/invalid|required|missing|must|unknown|duplicate/i.test(error?.message ?? "")) return error.message;
  return "request-rejected";
}
