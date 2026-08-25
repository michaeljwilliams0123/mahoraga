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
import { LocalArtifactStore } from "./local-artifact-store.mjs";
import { controllerAuthoritySnapshot } from "./controller-authority.mjs";
import { listExpertSkills, selectExpertSkills } from "./expert-skill-registry.mjs";
import {
  authenticateLocalRequest,
  classifyApiRoute,
  clearSessionCookie,
  cookieMutationOriginAllowed,
  createControlSessionManager,
  parseCookies,
  sessionCookie,
  CONTROL_SESSION_COOKIE,
} from "./control-session.mjs";
import { deriveTaskPolicy, policyTaskInput, sanitizeTaskIntake } from "./task-policy.mjs";

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

export function createControlServer({
  manifest, database, supervisor, primaryCodexToken, artifactStore, contentVault,
  controlSessions = createControlSessionManager(),
  controlOrigin = `http://${manifest.runtime.host}:${manifest.runtime.port}`,
  webRoot = WEB_ROOT,
}) {
  if (!(artifactStore instanceof LocalArtifactStore)) throw new TypeError("artifact-store-required");
  if (!contentVault || typeof contentVault.get !== "function" || typeof contentVault.metadata !== "function") throw new TypeError("content-vault-required");
  const staticAssets = snapshotStaticAssets(webRoot);
  return createServer(async (request, response) => {
    try {
      setHeaders(response, manifest);
      const url = new URL(request.url, `http://${manifest.runtime.host}:${manifest.runtime.port}`);
      if (request.method === "GET" && staticAssets.has(url.pathname)) return staticFile(response, staticAssets.get(url.pathname));
      if (request.method === "GET" && url.pathname === "/api/status") return json(response, 200, statusPayload(manifest, database, supervisor));
      if (request.method === "GET" && url.pathname === "/api/identity") return json(response, 200, identityPayload(manifest));
      if (request.method === "POST" && url.pathname === "/api/session/bootstrap-nonce") {
        if (!bearerMatches(request, primaryCodexToken)) return json(response, 401, { error: "primary-codex-token-required" });
        return json(response, 201, { nonce: controlSessions.issueBootstrapNonce(), expiresInMs: controlSessions.snapshot().nonceTtlMs });
      }
      if (request.method === "GET" && url.pathname === "/session/bootstrap") {
        const session = controlSessions.exchangeBootstrapNonce(url.searchParams.get("nonce"));
        response.writeHead(302, { "Set-Cookie": sessionCookie(session.sessionId, session.idleTtlMs), Location: "/", "Cache-Control": "no-store" });
        return response.end();
      }
      const routeClass = classifyApiRoute(request.method, url.pathname);
      const authentication = authenticateLocalRequest(request, { primaryToken: primaryCodexToken, sessions: controlSessions });
      if (routeClass !== "static" && !authentication.authenticated) return json(response, 401, { error: "local-session-required" });
      if (routeClass === "mutation" && authentication.mechanism === "cookie" && !cookieMutationOriginAllowed(request, controlOrigin)) {
        return json(response, 403, { error: "same-origin-required" });
      }
      if (request.method === "POST" && url.pathname === "/api/session/logout") {
        const sessionId = parseCookies(request.headers.cookie)[CONTROL_SESSION_COOKIE];
        if (sessionId) controlSessions.revokeSession(sessionId);
        response.setHeader("Set-Cookie", clearSessionCookie());
        return json(response, 200, { authenticated: false });
      }
      const contentRoute = url.pathname.match(/^\/api\/content\/(vault:[a-f0-9-]{36})$/);
      if (request.method === "GET" && contentRoute) {
        const expected = {
          ownerType: requiredQuery(url, "ownerType"),
          ownerId: requiredQuery(url, "ownerId"),
          classification: requiredQuery(url, "classification"),
        };
        const metadata = contentVault.metadata(contentRoute[1], expected);
        const bytes = contentVault.get(contentRoute[1], expected);
        database.recordContentAccess({ reference: contentRoute[1], ...expected, mechanism: authentication.mechanism, sessionId: authentication.sessionId });
        return contentBytes(response, metadata, bytes);
      }
      if (request.method === "GET" && url.pathname === "/api/expert-skills") return json(response, 200, { skills: listExpertSkills() });
      if (request.method === "POST" && url.pathname === "/api/expert-skills/select") {
        const body = await bodyJson(request);
        return json(response, 200, { selection: selectExpertSkills(body) });
      }
      if (request.method === "GET" && url.pathname === "/api/coordination") return json(response, 200, coordinationPayload(manifest, database));
      if (request.method === "POST" && url.pathname === "/api/coordination/integration-lease/acquire") {
        if (!bearerMatches(request, primaryCodexToken)) return json(response, 401, { error: "primary-codex-token-required" });
        const body = await bodyJson(request);
        const result = database.acquireIntegrationLease({ controllerId: body.controllerId, durationMs: body.durationMs, purpose: body.purpose, paths: body.paths ?? [] });
        return json(response, result.acquired ? 201 : 409, result);
      }
      if (request.method === "POST" && url.pathname === "/api/coordination/integration-lease/release") {
        if (!bearerMatches(request, primaryCodexToken)) return json(response, 401, { error: "primary-codex-token-required" });
        const body = await bodyJson(request);
        return json(response, 200, database.releaseIntegrationLease({ controllerId: body.controllerId, leaseId: body.leaseId }));
      }
      if (request.method === "POST" && url.pathname === "/api/artifacts") {
        const name = decodeURIComponent(headerValue(request, "x-mahoraga-file-name"));
        const mimeType = headerValue(request, "content-type").split(";", 1)[0].trim() || "application/octet-stream";
        const source = headerValue(request, "x-mahoraga-file-source") || "api";
        const bytes = await bodyBytes(request, artifactStore.maximumBytes);
        return json(response, 201, { artifact: await artifactStore.put({ name, mimeType, source, bytes }) });
      }
      const artifactRoute = url.pathname.match(/^\/api\/artifacts\/(art-[a-f0-9-]+)$/);
      const artifactContentRoute = url.pathname.match(/^\/api\/artifacts\/(art-[a-f0-9-]+)\/content$/);
      if (request.method === "GET" && artifactRoute) return json(response, 200, { artifact: await artifactStore.get(artifactRoute[1]) });
      if (request.method === "GET" && artifactContentRoute) {
        const artifact = await artifactStore.read(artifactContentRoute[1]);
        return artifactContent(response, artifact);
      }
      if (request.method === "DELETE" && artifactRoute) {
        if (database.isArtifactReferenced(artifactRoute[1])) return json(response, 409, { error: "artifact-in-use" });
        await artifactStore.remove(artifactRoute[1]);
        return json(response, 200, { deleted: true, artifactId: artifactRoute[1] });
      }
      if (request.method === "POST" && url.pathname === "/api/intake/primary-codex") {
        if (!bearerMatches(request, primaryCodexToken)) return json(response, 401, { error: "primary-codex-token-required" });
        const body = await bodyJson(request);
        const correlationId = body.correlationId ?? body.idempotencyKey ?? `pcx-${randomUUID()}`;
        const task = submitTask(database, manifest, { ...body, intent: body.intent ?? body.capability, correlationId }, { source: "primary-codex", internal: true });
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
        const task = submitTask(database, manifest, builderIntakeBody(body, correlationId), { source: "primary-codex-builder", internal: true });
        const session = database.createCodexBuilderSession({ taskId: task.id, authoritySessionId: body.authoritySessionId ?? null });
        return json(response, 202, { session, receipt: database.recordReceipt({ task, phase: "accepted", verifier: "primary-codex-builder-intake", summary: "Task-scoped Codex Builder assignment accepted for direct non-interactive execution." }), task });
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
        const attachments = await artifactStore.resolve(body.attachmentIds ?? []);
        return json(response, 201, { conversation: database.createConversation({ title: body.title, initialMessage: body.initialMessage ?? null, attachments, classification: body.classification ?? "local-only" }) });
      }
      const conversationMessages = url.pathname.match(/^\/api\/conversations\/(con-[a-f0-9-]+)\/messages$/);
      if (request.method === "GET" && conversationMessages) return json(response, 200, { messages: database.listConversationMessages(conversationMessages[1]) });
      if (request.method === "POST" && conversationMessages) {
        const body = await bodyJson(request);
        const attachments = await artifactStore.resolve(body.attachmentIds ?? []);
        return json(response, 201, { message: database.addConversationMessage({ conversationId: conversationMessages[1], taskId: body.taskId ?? null, role: body.role ?? "user", content: body.content, attachments, requiresResponse: body.requiresResponse ?? false }) });
      }
      if (request.method === "POST" && url.pathname === "/api/tasks") {
        const body = await bodyJson(request);
        const task = submitTask(database, manifest, body, { source: "control-center", internal: false });
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
      if (/^(?:task-|caller-|attended-|integration-)/.test(error?.code ?? "")) {
        return json(response, 422, { error: error.code });
      }
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
    workers, capabilities: capabilityIndex(manifest, workers), expertSkills: listExpertSkills(), connections: manifest.connections,
    improvementsAwaitingUser: database.listImprovements().filter((item) => item.status === "proposed").length,
    conversations: { active: database.listConversations().filter((item) => item.status === "active").length },
    objectiveCounts: Object.fromEntries(["active", "completed", "failed", "cancelled"].map((state) => [state, database.listObjectives(100).filter((item) => item.status === state).length])),
  };
}

export function identityPayload(manifest) {
  return {
    product: manifest.product,
    version: manifest.version,
    environment: manifest.environment,
    loopbackOnly: manifest.runtime.host === "127.0.0.1",
    controlCenterVersion: manifest.versions.controlCenter,
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
  const authority = controllerAuthoritySnapshot();
  authority.integration.activeLease = database.getIntegrationLease();
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
    authority,
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

function submitTask(database, manifest, body, options = {}) {
  const request = options.internal ? Object.freeze({ ...body, intent: body.intent ?? body.capability }) : sanitizeTaskIntake(body);
  const policy = deriveTaskPolicy(request, {
    manifest, source: options.source ?? "control-center", internal: options.internal === true,
    attendedSession: options.attendedSession ?? null, integrationLease: database.getIntegrationLease(),
  });
  const existing = request.idempotencyKey ? database.getTaskByIdempotencyKey(request.idempotencyKey) : null;
  let conversationId;
  if (request.conversationId === false) conversationId = null;
  else if (request.conversationId !== undefined) conversationId = request.conversationId;
  else if (existing) conversationId = existing.conversationId;
  else conversationId = database.createConversation({
      title: request.requestedOutcome ?? policy.intent,
      initialMessage: request.initialMessage ?? `Run ${policy.intent}`,
      classification: policy.dataClass,
    }).id;
  return database.submitPolicyTask({ ...policyTaskInput(request, policy, manifest), conversationId });
}

export function builderIntakeBody(body, correlationId) {
  return {
    intent: "codex.execute", idempotencyKey: body.idempotencyKey, correlationId,
    requestedOutcome: body.requestedOutcome, priority: body.priority ?? "normal", maximumAttempts: 1,
    taskArea: body.taskArea ?? "codex-builder", conversationId: false,
    authoritySessionId: body.authoritySessionId ?? null, integrationLeaseId: body.integrationLeaseId ?? null,
    baseCommit: body.baseCommit, allowedPaths: body.allowedPaths,
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
function artifactContent(response, { metadata, bytes }) {
  const safeInline = /^(?:image\/(?:png|jpeg|gif|webp|avif)|application\/pdf)$/.test(metadata.mimeType);
  const contentType = safeInline ? metadata.mimeType : "application/octet-stream";
  const disposition = safeInline ? "inline" : "attachment";
  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": bytes.length,
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(metadata.name)}`,
    "X-Mahoraga-Artifact-Sha256": metadata.sha256,
  });
  response.end(bytes);
}
function contentBytes(response, metadata, bytes) {
  response.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": bytes.length,
    "Content-Disposition": "attachment; filename=mahoraga-content.bin",
    "X-Mahoraga-Content-Sha256": metadata.sha256,
    "X-Mahoraga-Content-Classification": metadata.classification,
    "X-Mahoraga-Content-Expires-At": metadata.expiresAt,
    "Cache-Control": "no-store",
  });
  response.end(bytes);
}
function requiredQuery(url, name) { const value = url.searchParams.get(name); if (!value) throw new Error(`content-${name}-required`); return value; }
async function bodyJson(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 16384) throw new Error("request-too-large"); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
async function bodyBytes(request, maximumBytes) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > maximumBytes) throw new Error("artifact-too-large"); chunks.push(chunk); }
  if (size < 1) throw new Error("artifact-empty");
  return Buffer.concat(chunks);
}
function headerValue(request, name) { const value = request.headers[name]; return Array.isArray(value) ? value[0] ?? "" : String(value ?? ""); }
function classify(error) {
  if (error instanceof SyntaxError) return "invalid-json";
  if (/invalid|required|missing|must|unknown|duplicate/i.test(error?.message ?? "")) return error.message;
  if (/^artifact-(?:empty|too-large|name-invalid|mime-invalid|source-invalid)$/.test(error?.message ?? "")) return error.message;
  if (/^vault-(?:reference-invalid|owner-mismatch|classification-mismatch|record-expired|record-missing|authentication-failed)$/.test(error?.message ?? "")) return error.message;
  return "request-rejected";
}
