import { createServer } from "node:http";
import { capabilityIndex } from "./router.mjs";
import { createHash, randomUUID } from "node:crypto";
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
import { autonomyPolicySnapshot } from "./autonomy-policy.mjs";
import { createAutonomousConversation, createAutonomousConversationTurn } from "./autonomy-orchestrator.mjs";
import { autonomyAllowedPaths } from "./autonomy-execution-scope.mjs";
import { readRepositoryHead } from "./repository-worker.mjs";
import { createConversationGateway } from "./conversation-gateway.mjs";
import { chatConversationTitle, classifyChatTurn } from "./chat-intake.mjs";

export const DEFAULT_WORKSPACE_URL = "https://mahoraga-cloud-workspace.vercel.app/";

export function canonicalWorkspaceUrl(value = process.env.MAHORAGA_WORKSPACE_URL ?? DEFAULT_WORKSPACE_URL) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new TypeError("canonical-workspace-url-invalid"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") throw new TypeError("canonical-workspace-url-invalid");
  return parsed.href;
}

export function createControlServer({
  manifest, database, supervisor, primaryCodexToken, artifactStore, contentVault,
  controlSessions = createControlSessionManager(),
  controlOrigin = `http://${manifest.runtime.host}:${manifest.runtime.port}`,
  workspaceUrl = canonicalWorkspaceUrl(), conversationGateway = null, mcpHost = null,
  repositoryHeadReader = readRepositoryHead,
}) {
  if (!(artifactStore instanceof LocalArtifactStore)) throw new TypeError("artifact-store-required");
  if (!contentVault || typeof contentVault.get !== "function" || typeof contentVault.metadata !== "function") throw new TypeError("content-vault-required");
  const canonicalWorkspace = canonicalWorkspaceUrl(workspaceUrl);
  const autonomyPolicy = autonomyPolicySnapshot(manifest);
  const relayHandlers = createRelayHandlers({ database, manifest, supervisor, artifactStore, contentVault, autonomyPolicy, repositoryHeadReader });
  const gateway = conversationGateway ?? createConversationGateway({
    database, manifest, supervisor, relayHandlers,
    capabilityResolver: () => {
      const base = capabilityIndex(manifest, supervisor.status());
      const discovered = mcpHost?.listTools?.() ?? [];
      return [...base, ...discovered.map((item) => ({ capability: item.capabilityId, routable: false, workerIds: [item.providerId] }))];
    },
    submitTask: (body, context) => submitTask(database, manifest, body, {
      source: "conversation-gateway", internal: false, attendedSession: context.attendedSession ?? null,
    }),
  });
  const server = createServer(async (request, response) => {
    try {
      setHeaders(response, manifest);
      const url = new URL(request.url, `http://${manifest.runtime.host}:${manifest.runtime.port}`);
      if (request.method === "GET" && url.pathname === "/") return redirect(response, canonicalWorkspace);
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
      const expectedControlOrigin = controlOrigin ?? `http://${manifest.runtime.host}:${request.socket.localPort}`;
      if (routeClass === "mutation" && authentication.mechanism === "cookie" && !cookieMutationOriginAllowed(request, expectedControlOrigin)) {
        return json(response, 403, { error: "same-origin-required" });
      }
      if (request.method === "POST" && url.pathname === "/api/session/logout") {
        const sessionId = parseCookies(request.headers.cookie)[CONTROL_SESSION_COOKIE];
        if (sessionId) controlSessions.revokeSession(sessionId);
        response.setHeader("Set-Cookie", clearSessionCookie());
        return json(response, 200, { authenticated: false });
      }
      if (request.method === "POST" && url.pathname === "/api/v2/runs") {
        const body = await bodyJson(request);
        const result = gateway.createRun({ ...body, sessionId: gatewaySessionId(authentication) }, {
          attendedSession: authentication.mechanism === "cookie" ? { active: true, sessionId: authentication.sessionId } : null,
        });
        return json(response, 202, result);
      }
      const runEvents = url.pathname.match(/^\/api\/v2\/runs\/(run-[a-f0-9-]+)\/events$/);
      if (request.method === "GET" && runEvents) {
        const afterEventId = numericQuery(url, "after", 0);
        return sse(response, gateway.replay(runEvents[1], afterEventId));
      }
      const runCancel = url.pathname.match(/^\/api\/v2\/runs\/(run-[a-f0-9-]+)\/cancel$/);
      if (request.method === "POST" && runCancel) return json(response, 200, { run: gateway.cancelRun(runCancel[1]) });
      if (request.method === "GET" && url.pathname === "/api/v2/capabilities") return json(response, 200, { capabilities: gateway.capabilities() });
      const v2Improvement = url.pathname.match(/^\/api\/v2\/improvements\/(imp-[a-f0-9-]+)$/);
      if (request.method === "GET" && v2Improvement) {
        const improvement = gateway.getImprovement(v2Improvement[1]);
        return improvement ? json(response, 200, { improvement }) : json(response, 404, { error: "improvement-not-found" });
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
      if (request.method === "POST" && url.pathname === "/api/chat") {
        const body = await bodyJson(request);
        const result = await executeChatTurn({ database, manifest, supervisor, artifactStore, autonomyPolicy, body, repositoryHeadReader, context: {
          source: "control-center-chat",
          attendedSession: authentication.mechanism === "cookie" ? { active: true, sessionId: authentication.sessionId } : null,
        } });
        return json(response, result.status, result.value);
      }
      if (request.method === "POST" && url.pathname === "/api/conversations") {
        const body = await bodyJson(request);
        const attachments = await artifactStore.resolve(body.attachmentIds ?? []);
        const initialMessage = body.initialMessage ?? null;
        const requiresResponse = body.requiresResponse ?? false;
        const executionContract = autonomyPolicy.conversationActivation === true && requiresResponse === true
          ? await resolveAutonomyExecutionContract(initialMessage ?? "Attached file", repositoryHeadReader)
          : null;
        const result = createAutonomousConversation({
          database,
          policy: autonomyPolicy,
          title: body.title,
          initialMessage,
          attachments,
          requiresResponse,
          requestedMode: body.requestedMode ?? manifest.defaultAutonomyMode,
          taskArea: body.taskArea ?? "mahoraga-autonomy",
          executionContract,
        });
        if (result.objective) return json(response, 202, result);
        return json(response, 201, { conversation: result.conversation });
      }
      const conversationMessages = url.pathname.match(/^\/api\/conversations\/(con-[a-f0-9-]+)\/messages$/);
      if (request.method === "GET" && conversationMessages) return json(response, 200, { messages: database.listConversationMessages(conversationMessages[1]) });
      if (request.method === "POST" && conversationMessages) {
        const body = await bodyJson(request);
        const attachments = await artifactStore.resolve(body.attachmentIds ?? []);
        const taskId = body.taskId ?? null;
        const role = body.role ?? "user";
        const requiresResponse = body.requiresResponse ?? false;
        const executionContract = autonomyPolicy.conversationActivation === true && role === "user" && requiresResponse === true && taskId === null
          ? await resolveAutonomyExecutionContract(body.content, repositoryHeadReader)
          : null;
        const turn = createAutonomousConversationTurn({
          database,
          policy: autonomyPolicy,
          conversationId: conversationMessages[1],
          taskId,
          role,
          content: body.content,
          attachments,
          requiresResponse,
          requestedMode: body.requestedMode ?? manifest.defaultAutonomyMode,
          taskArea: body.taskArea ?? "mahoraga-autonomy",
          executionContract,
        });
        if (turn.objective) return json(response, 202, turn);
        return json(response, 201, { message: turn.message });
      }
      if (request.method === "POST" && url.pathname === "/api/tasks") {
        const body = await bodyJson(request);
        const task = submitTask(database, manifest, body, {
          source: "control-center",
          internal: false,
          attendedSession: authentication.mechanism === "cookie" ? { active: true, sessionId: authentication.sessionId } : null,
        });
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
      if (error?.code === "foreground-run-active" || error?.code === "run-idempotency-conflict") return json(response, 409, { error: error.code });
      if (/^(?:run-|gateway-)/.test(error?.code ?? "")) return json(response, 422, { error: error.code });
      if (/^(?:task-|caller-|attended-|integration-)/.test(error?.code ?? "")) {
        return json(response, 422, { error: error.code });
      }
      json(response, 400, { error: classify(error) });
    }
  });
  server.once("close", () => gateway.close());
  server.conversationGateway = gateway;
  return server;
}

export function statusPayload(manifest, database, supervisor) {
  const tasks = database.listTasks();
  const workers = supervisor.status();
  const generatedAt = new Date().toISOString();
  const runtimeHealth = supervisor.health(Date.parse(generatedAt));
  const capabilities = capabilityIndex(manifest, workers, Date.parse(generatedAt));
  return {
    generatedAt,
    product: manifest.product, version: manifest.version, versions: manifest.versions, phase: manifest.phase,
    controlCenterApi: {
      protocolVersion: 1,
      runtimeVersion: manifest.version,
      controlCenterVersion: manifest.versions.controlCenter,
      assetSetId: `${manifest.version}:${manifest.versions.controlCenter}`,
      staticAssetsSnapshotted: false,
      interactionSurface: "vercel-workspace",
      localUiRetired: true,
    },
    environment: manifest.environment, featureFlags: manifest.featureFlags, queue: manifest.queue,
    updateAuthority: manifest.updateAuthority, autonomyMode: manifest.defaultAutonomyMode, routingPolicy: manifest.routingPolicy,
    repairPolicy: {
      enabled: manifest.repair.enabled,
      automaticRiskClasses: manifest.repair.automaticRiskClasses,
      coreUpdateAuthority: manifest.repair.coreUpdateAuthority,
      scanIntervalMs: manifest.repair.scanIntervalMs,
    },
    runtime: {
      host: manifest.runtime.host, port: manifest.runtime.port, ...runtimeHealth,
      processState: runtimeHealth.supervisorRunning ? "live" : "stopped",
      evidenceLevel: runtimeHealth.supervisorRunning ? "observed" : "unknown",
      lastObservedAt: runtimeHealth.startedAt ? generatedAt : null,
    },
    taskCounts: Object.fromEntries(["queued", "claimed", "running", "verifying", "waiting", "waiting_for_user", "completed", "failed", "cancelled"].map((state) => [state, tasks.filter((task) => task.status === state).length])),
    workers, capabilities, expertSkills: listExpertSkills(), connections: connectionProjections(manifest.connections, capabilities),
    evidencePolicy: {
      routeRequiresFreshCanary: true,
      writeCanaryTtlMs: manifest.truthContracts.capabilityReadiness.writeCanaryTtlMs,
      deterministicReadCanaryTtlMs: manifest.truthContracts.capabilityReadiness.deterministicReadCanaryTtlMs,
      unknownIsRoutable: false,
    },
    repairIncidents: database.listRepairIncidents({ includeResolved: false }).map((incident) => ({
      id: incident.id, relative: incident.relative, condition: incident.condition, status: incident.status,
      recoveryState: incident.recoveryState, evidenceLevel: "observed", lastObservedAt: incident.updatedAt,
      expectedSha256: incident.expectedSha256, observedSha256: incident.observedSha256, lastErrorCode: incident.lastErrorCode,
    })),
    improvementsAwaitingUser: database.listImprovements().filter((item) => item.status === "proposed").length,
    conversations: { active: database.listConversations().filter((item) => item.status === "active").length },
    objectiveCounts: Object.fromEntries(["active", "completed", "failed", "cancelled"].map((state) => [state, database.listObjectives(100).filter((item) => item.status === state).length])),
  };
}

function connectionProjections(connections, capabilities) {
  return connections.map((connection) => {
    const routes = connection.capabilities.map((capability) => capabilities.find((item) => item.capability === capability)).filter(Boolean);
    const routable = routes.filter((item) => item.routable);
    const latestObservedAt = routes.map((item) => item.lastObservedAt).filter(Boolean).sort().at(-1) ?? null;
    const latestVerifiedAt = routes.map((item) => item.lastVerifiedAt).filter(Boolean).sort().at(-1) ?? null;
    return {
      id: connection.id,
      endpointClass: connection.endpointClass,
      capabilities: [...connection.capabilities],
      configuredState: connection.state,
      observedState: routable.length > 0 ? "routable" : routes.length > 0 ? "not-routable" : "not-observed",
      evidenceLevel: routable.length > 0 ? "verified" : routes.some((item) => item.evidenceLevel === "inferred") ? "inferred" : "observed",
      lastObservedAt: latestObservedAt,
      lastVerifiedAt: latestVerifiedAt,
      routingReasons: [...new Set(routes.filter((item) => !item.routable).map((item) => item.routingReason ?? "not-verified"))],
      routableCapabilities: routable.map((item) => item.capability),
    };
  });
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

function createRelayHandlers({ database, manifest, supervisor, artifactStore, contentVault, autonomyPolicy, repositoryHeadReader }) {
  return Object.freeze({
    async chat(body, context) {
      if (Array.isArray(body?.attachmentIds) && body.attachmentIds.length > 0) throw relayError("relay-attachments-local-only");
      const result = await executeChatTurn({
        database, manifest, supervisor, artifactStore, autonomyPolicy, repositoryHeadReader,
        body: { ...body, creditPolicy: "zero-codex", attachmentIds: [] },
        context: { source: "owner-paired-relay-chat", attendedSession: context.attendedSession },
      });
      if (result.status >= 400) throw relayError(result.value.error ?? "relay-chat-rejected");
      return result.value;
    },
    tasks(conversationId) {
      const id = relayId(conversationId, /^con-[a-f0-9-]+$/, "relay-conversation-invalid");
      if (!database.getConversation(id)) throw relayError("conversation-not-found");
      return database.listTasks().filter((task) => task.conversationId === id);
    },
    messages(conversationId) {
      const id = relayId(conversationId, /^con-[a-f0-9-]+$/, "relay-conversation-invalid");
      if (!database.getConversation(id)) throw relayError("conversation-not-found");
      return database.listConversationMessages(id);
    },
    messageContent(body, context) {
      const conversationId = relayId(body?.conversationId, /^con-[a-f0-9-]+$/, "relay-conversation-invalid");
      const messageId = relayId(body?.messageId, /^msg-[a-f0-9-]+$/, "relay-message-invalid");
      const contentReference = relayId(body?.contentReference, /^vault:[a-f0-9-]{36}$/, "relay-content-reference-invalid");
      const classification = relayId(body?.classification, /^(?:synthetic|personal|enterprise|local-only)$/, "relay-classification-invalid");
      const message = database.listConversationMessages(conversationId).find((item) => item.id === messageId);
      if (!message || message.contentReference !== contentReference || message.classification !== classification) throw relayError("relay-message-content-mismatch");
      const expected = { ownerType: "message", ownerId: messageId, classification };
      contentVault.metadata(contentReference, expected);
      const bytes = contentVault.get(contentReference, expected);
      database.recordContentAccess({ reference: contentReference, ...expected, mechanism: context.mechanism, sessionId: context.attendedSession.sessionId });
      return { content: bytes.toString("utf8") };
    },
    taskAction(body) {
      const taskId = relayId(body?.taskId, /^mhg-[a-f0-9-]+$/, "relay-task-invalid");
      const conversationId = relayId(body?.conversationId, /^con-[a-f0-9-]+$/, "relay-conversation-invalid");
      if (!new Set(["retry", "cancel"]).has(body?.action)) throw relayError("relay-task-action-invalid");
      const existing = database.getTask(taskId);
      if (!existing || existing.conversationId !== conversationId) throw relayError("task-not-found");
      const task = body.action === "retry" ? database.retryTask(taskId) : database.cancelTask(taskId);
      return { task };
    },
  });
}

async function executeChatTurn({ database, manifest, artifactStore, autonomyPolicy, body, repositoryHeadReader, context }) {
  const creditPolicy = chatCreditPolicy(body.creditPolicy);
  const attachments = await artifactStore.resolve(body.attachmentIds ?? []);
  const availableCapabilities = [...new Set(manifest.workers.filter((item) => item.enabled).flatMap((item) => item.capabilities))];
  const decision = classifyChatTurn({ mode: body.mode ?? "auto", content: body.content, attachmentCount: attachments.length, availableCapabilities });
  if (decision.execution === "unavailable") return { status: 503, value: { error: decision.reasonCode, decision } };
  if (creditPolicy === "zero-codex") {
    if (decision.execution === "objective") return { status: 409, value: { error: "zero-credit-objective-provider-unavailable", decision } };
    const eligible = manifest.workers.filter((worker) => worker.enabled && worker.capabilities.includes(decision.capability));
    if (!eligible.some((worker) => new Set(["deterministic", "local-model"]).has(worker.costClass))) {
      return { status: 409, value: { error: "zero-credit-provider-unavailable", decision } };
    }
  }
  const title = chatConversationTitle(body.content);
  if (decision.execution === "objective") {
    const executionContract = await resolveAutonomyExecutionContract(body.content, repositoryHeadReader);
    const result = body.conversationId
      ? createAutonomousConversationTurn({ database, policy: autonomyPolicy, conversationId: body.conversationId, content: body.content, attachments, requiresResponse: true, requestedMode: manifest.defaultAutonomyMode, taskArea: decision.intentKind, executionContract })
      : createAutonomousConversation({ database, policy: autonomyPolicy, title, initialMessage: body.content, attachments, requiresResponse: true, requestedMode: manifest.defaultAutonomyMode, taskArea: decision.intentKind, executionContract });
    const conversation = body.conversationId ? database.getConversation(body.conversationId) : result.conversation;
    return { status: 202, value: { decision, conversation, task: null, objective: result.objective } };
  }
  let conversation;
  if (body.conversationId) {
    conversation = database.getConversation(body.conversationId);
    if (!conversation) return { status: 404, value: { error: "conversation-not-found" } };
    database.addConversationMessage({ conversationId: conversation.id, role: "user", content: body.content, attachments });
  } else {
    conversation = database.createConversation({ title, initialMessage: body.content, attachments, classification: "local-only" });
  }
  const task = submitTask(database, manifest, {
    intent: decision.capability, requestedOutcome: body.content, priority: "high",
    maximumAttempts: decision.capability === "assistant.respond" ? 1 : undefined,
    taskArea: decision.intentKind, conversationId: conversation.id, idempotencyKey: body.idempotencyKey,
  }, { source: context.source, internal: false, attendedSession: context.attendedSession ?? null });
  return { status: 202, value: { decision, conversation, task, objective: null } };
}

async function resolveAutonomyExecutionContract(message, repositoryHeadReader) {
  if (typeof repositoryHeadReader !== "function") throw new TypeError("repository-head-reader-required");
  const baseCommit = String(await repositoryHeadReader()).trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(baseCommit)) throw new TypeError("autonomy-repository-head-invalid");
  return Object.freeze({ baseCommit, allowedPaths: autonomyAllowedPaths(message) });
}

function relayId(value, pattern, code) {
  if (typeof value !== "string" || !pattern.test(value)) throw relayError(code);
  return value;
}
function chatCreditPolicy(value = "standard") {
  if (!new Set(["standard", "zero-codex"]).has(value)) throw relayError("chat-credit-policy-invalid");
  return value;
}
function relayError(code) { const error = new TypeError(code); error.code = code; return error; }

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
  response.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self' https://api.github.com https://relay.mahoraga.app wss://relay.mahoraga.app; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  response.setHeader("X-Mahoraga-Runtime-Version", manifest.version);
  response.setHeader("X-Mahoraga-Control-Center-Version", manifest.versions.controlCenter);
}
function redirect(response, location) { response.writeHead(307, { Location: location }); response.end(); }
function json(response, status, value) { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify(value)); }
function sse(response, events) {
  response.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", Connection: "close", "Cache-Control": "no-store" });
  for (const event of events) response.write(`id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  response.end();
}
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
function numericQuery(url, name, fallback) { const raw = url.searchParams.get(name); if (raw === null) return fallback; const value = Number(raw); if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name}-invalid`); return value; }
function gatewaySessionId(authentication) { return authentication.sessionId ? `ses-${createHash("sha256").update(authentication.sessionId).digest("hex").slice(0, 24)}` : "ses-primary-codex"; }
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
