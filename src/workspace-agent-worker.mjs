import { createHash } from "node:crypto";

const WORKSPACE_AGENT_ORIGIN = "https://api.chatgpt.com";
const RUN_BETA = "workspace_agent_runs=v1";

export function workspaceAgentCredentialState(worker, env = process.env) {
  const adapter = requireAdapter(worker);
  const accessToken = env[adapter.accessTokenEnvironmentVariable];
  const triggerId = env[adapter.triggerIdEnvironmentVariable];
  const platformApiKeyRejected = typeof accessToken === "string" && /^sk-/i.test(accessToken);
  const accessTokenConfigured = typeof accessToken === "string" && accessToken.length >= 20 && !platformApiKeyRejected;
  const triggerIdConfigured = typeof triggerId === "string" && /^agtch_[A-Za-z0-9_-]{3,160}$/.test(triggerId);
  return {
    ready: accessTokenConfigured && triggerIdConfigured,
    accessTokenConfigured,
    platformApiKeyRejected,
    triggerIdConfigured,
    responseRetrievalAvailable: false,
    resultTransport: "github-secondary-branch",
  };
}

export function buildWorkspaceAgentEnvelope({ task, worker, env = process.env }) {
  const adapter = requireAdapter(worker);
  const credentials = workspaceAgentCredentialState(worker, env);
  if (!credentials.ready) throw new Error("workspace-agent-credentials-missing");
  const assignmentId = bounded(task?.assignmentId, 80, "assignment ID");
  if (!/^sec-[0-9a-f-]{36}$/i.test(assignmentId)) throw new TypeError("assignment ID is invalid");
  const returnBranch = bounded(task?.returnBranch, 128, "return branch");
  if (returnBranch !== `${adapter.branchPrefix}${assignmentId}`) throw new TypeError("return branch is invalid");
  const expectedBaseCommit = bounded(task?.expectedBaseCommit, 64, "expected base commit");
  if (!/^[0-9a-f]{40,64}$/i.test(expectedBaseCommit)) throw new TypeError("expected base commit is invalid");
  const correlationId = bounded(task?.correlationId ?? assignmentId, 128, "correlation ID");
  const requestedOutcome = bounded(task?.requestedOutcome, 4000, "requested outcome");
  const allowedPaths = validatePaths(task?.allowedPaths);
  const triggerId = env[adapter.triggerIdEnvironmentVariable];
  const input = [
    "You are the subordinate cloud Codex execution lane for Mahoraga.",
    `Repository: ${adapter.repository}`,
    `Assignment: ${assignmentId}`,
    `Correlation: ${correlationId}`,
    `Expected base commit: ${expectedBaseCommit}`,
    `Return branch: ${returnBranch}`,
    `Allowed paths: ${allowedPaths.join(", ")}`,
    "Fetch main and follow docs/github-codex-coordination.md. Read only the structured assignment and repository files needed for the task.",
    "Do not access or export ChatGPT conversation history, private chats, credentials, browser history, personal files, or unrelated context.",
    `Push only ${returnBranch}; never push directly to main, force-push, or rewrite history.`,
    "Record the bounded result in coordination/results and run the assignment's relevant verification.",
    `Requested outcome: ${requestedOutcome}`,
  ].join("\n");
  if (Buffer.byteLength(input, "utf8") > adapter.maximumInputBytes) throw new TypeError("workspace agent input is too large");
  return {
    endpoint: `${adapter.apiOrigin}/v1/workspace_agents/${triggerId}/trigger`,
    idempotencyKey: digest(`${assignmentId}:${expectedBaseCommit}:${returnBranch}`),
    body: { conversation_key: assignmentId, input },
    assignmentId,
    returnBranch,
  };
}

export async function executeWorkspaceAgentCapability(capability, task, worker, dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  if (capability === "workspace-agent.health") {
    const credentials = workspaceAgentCredentialState(worker, env);
    return {
      verified: credentials.ready,
      summary: credentials.ready
        ? "Workspace-Agent-scoped trigger credentials are configured; a live trigger is still required to prove workspace entitlement and execution."
        : credentials.platformApiKeyRejected
          ? "Workspace Agent cloud lane rejected an OpenAI Platform API key; configure a Workspace-Agent-scoped access token from the ChatGPT workspace admin flow."
          : "Workspace Agent cloud lane is staged but disabled until an admin-provisioned AGENT_ACCESS_TOKEN and WORKSPACE_AGENT_TRIGGER_ID are stored securely.",
      providerHealth: credentials,
    };
  }
  if (capability === "workspace-agent.trigger") {
    const adapter = requireAdapter(worker);
    const envelope = buildWorkspaceAgentEnvelope({ task, worker, env });
    const response = await requestJson(fetchImpl, envelope.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env[adapter.accessTokenEnvironmentVariable]}`,
        "Content-Type": "application/json",
        "Idempotency-Key": envelope.idempotencyKey,
        "OpenAI-Beta": RUN_BETA,
      },
      body: JSON.stringify(envelope.body),
    }, adapter.requestTimeoutMs);
    if (response.status !== 202) throw new Error(`workspace-agent-trigger-http-${response.status}`);
    const runId = optionalRunId(response.body?.agent_trigger_run_id);
    const conversationUrl = boundedUrl(response.body?.conversation_url);
    return {
      verified: true,
      summary: `Workspace Agent accepted assignment ${envelope.assignmentId}; execution is pending and must return through ${envelope.returnBranch}.`,
      providerReceipt: {
        accepted: true,
        runId,
        conversationUrlSha256: digest(conversationUrl),
        responseRetrievalAvailable: false,
        returnBranch: envelope.returnBranch,
      },
    };
  }
  if (capability === "workspace-agent.status") {
    const adapter = requireAdapter(worker);
    const credentials = workspaceAgentCredentialState(worker, env);
    if (!credentials.ready) throw new Error("workspace-agent-credentials-missing");
    const runId = requiredRunId(task?.providerRunId);
    const triggerId = env[adapter.triggerIdEnvironmentVariable];
    const response = await requestJson(fetchImpl, `${adapter.apiOrigin}/v1/workspace_agents/${triggerId}/runs/${runId}`, {
      headers: { Authorization: `Bearer ${env[adapter.accessTokenEnvironmentVariable]}` },
    }, adapter.requestTimeoutMs);
    if (response.status !== 200) throw new Error(`workspace-agent-status-http-${response.status}`);
    const status = bounded(response.body?.status, 40, "run status");
    if (!new Set(["queued", "in_progress", "suspended", "completed", "failed", "cancelled"]).has(status)) throw new Error("workspace-agent-status-invalid");
    return {
      verified: true,
      summary: `Workspace Agent run ${runId} is ${status}; GitHub return validation remains authoritative for task completion.`,
      providerReceipt: { runId, status, responseRetrievalAvailable: false },
    };
  }
  throw new Error("unsupported-capability");
}

function requireAdapter(worker) {
  const adapter = worker?.adapter;
  if (worker?.id !== "workspace-agent-cloud" || adapter?.kind !== "chatgpt-workspace-agent" || adapter.apiOrigin !== WORKSPACE_AGENT_ORIGIN) {
    throw new TypeError("Workspace Agent adapter is invalid.");
  }
  return adapter;
}

async function requestJson(fetchImpl, url, options, timeoutMs) {
  if (typeof fetchImpl !== "function") throw new Error("workspace-agent-fetch-unavailable");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function validatePaths(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) throw new TypeError("allowed paths are invalid");
  const paths = value.map((item) => bounded(item, 160, "allowed path"));
  if (paths.some((item) => item.includes("..") || item.startsWith("/") || item.startsWith("\\") || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(item))) throw new TypeError("allowed paths are invalid");
  return [...new Set(paths)];
}
function requiredRunId(value) { const runId = bounded(value, 180, "run ID"); if (!/^apirun_[A-Za-z0-9_-]{3,160}$/.test(runId)) throw new TypeError("run ID is invalid"); return runId; }
function optionalRunId(value) { return value == null ? null : requiredRunId(value); }
function boundedUrl(value) { const url = bounded(value, 500, "conversation URL"); if (!/^https:\/\/chatgpt\.com\/c\/[A-Za-z0-9_-]+$/.test(url)) throw new Error("workspace-agent-conversation-url-invalid"); return url; }
function bounded(value, maximum, label) { if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\u0000]/.test(value)) throw new TypeError(`${label} is invalid`); return value; }
function digest(value) { return createHash("sha256").update(value ?? "", "utf8").digest("hex").slice(0, 32); }
