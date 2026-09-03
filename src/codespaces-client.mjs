import crypto from "node:crypto";
import { evaluateCloudComputeBudget, MAX_ACTIVE_DURATION_MS } from "./cloud-compute-budget.mjs";

export const CODESPACES_API_ORIGIN = "https://api.github.com";
export const REGISTERED_WORKFLOW_IDS = Object.freeze(["verify", "verify-conversation-plane", "cloud-cycle-dry-run"]);

export function createCodespacesClient({ fetchImpl = globalThis.fetch, token = process.env.GITHUB_TOKEN, repositoryFullName, userAgent = "mahoraga-zero-credit-codespaces-client", budgetEvaluator = evaluateCloudComputeBudget, registeredWorkflowIds = REGISTERED_WORKFLOW_IDS } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required.");
  if (!repositoryFullName || !repositoryFullName.includes("/")) throw new TypeError("repositoryFullName must be owner/repo.");
  const workflows = new Set(registeredWorkflowIds);
  const [owner, repo] = repositoryFullName.split("/");
  let activeCodespaceName = null;

  async function inspect({ telemetry } = {}) {
    const budget = budgetEvaluator({ telemetry });
    if (!budget.ok) return receipt("inspect", "blocked", budget.reason);
    const data = await requestJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/codespaces`);
    return receipt("inspect", "ok", null, { count: Number(data.total_count ?? data.codespaces?.length ?? 0) });
  }

  async function start({ telemetry, machine, devcontainerPath } = {}) {
    const budget = budgetEvaluator({ telemetry });
    if (!budget.ok) return receipt("start", "blocked", budget.reason);
    const body = Object.fromEntries(Object.entries({ machine, devcontainer_path: devcontainerPath }).filter(([, value]) => value));
    const data = await requestJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/codespaces`, { method: "POST", body });
    activeCodespaceName = data.name ?? null;
    return receipt("start", "ok", null, { codespaceIdHash: hash(data.id ?? data.name ?? "created"), maximumActiveDurationMs: MAX_ACTIVE_DURATION_MS });
  }

  async function executeRegisteredWorkflow({ telemetry, codespaceName, workflowId } = {}) {
    const budget = budgetEvaluator({ telemetry });
    if (!budget.ok) return receipt("execute", "blocked", budget.reason);
    if (!workflows.has(workflowId)) return receipt("execute", "blocked", "unregistered-workflow-id");
    if (!codespaceName) return receipt("execute", "blocked", "codespace-name-required");
    return receipt("execute", "prepared", null, { workflowIdHash: hash(workflowId), codespaceNameHash: hash(codespaceName) });
  }

  async function stop({ codespaceName } = {}) {
    if (!codespaceName) return receipt("stop", "blocked", "codespace-name-required");
    await requestJson(`/user/codespaces/${encodeURIComponent(codespaceName)}/stop`, { method: "POST" });
    if (activeCodespaceName === codespaceName) activeCodespaceName = null;
    return receipt("stop", "ok", null, { codespaceNameHash: hash(codespaceName) });
  }

  async function stopActive() {
    if (!activeCodespaceName) return receipt("stop", "blocked", "no-active-codespace");
    return stop({ codespaceName: activeCodespaceName });
  }

  async function requestJson(path, { method = "GET", body } = {}) {
    const response = await fetchImpl(`${CODESPACES_API_ORIGIN}${path}`, {
      method,
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token ?? ""}`, "x-github-api-version": "2022-11-28", "user-agent": userAgent, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }).catch((error) => { throw redactError(error); });
    if (!response.ok) throw redactError(new Error(`GitHub Codespaces request failed: ${response.status}`));
    return response.status === 204 ? {} : response.json();
  }
  return Object.freeze({ inspect, start, executeRegisteredWorkflow, stop, stopActive });
}

export function redactError(error) {
  const message = String(error?.message ?? error).replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer <redacted>").replace(/gh[pousr]_[A-Za-z0-9_]+/g, "<redacted>");
  return Object.assign(new Error(message), { code: error?.code });
}
function receipt(action, status, reason = null, extra = {}) { return Object.freeze({ action, status, reason, ...extra, at: new Date().toISOString() }); }
function hash(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
