import { existsSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./config.mjs";

export function buildGapAudit(manifest, { root = ROOT, fileExists = existsSync } = {}) {
  if (!manifest || typeof manifest !== "object") throw new TypeError("Manifest is required for gap audit.");

  const worker = (id) => manifest.workers?.find((item) => item.id === id) ?? null;
  const has = (relative) => fileExists(path.join(root, ...relative.split("/")));

  const closed = [];
  const open = [];

  record(closed, manifest.runtime?.host === "127.0.0.1", {
    id: "localhost-runtime-boundary",
    priority: "critical",
    summary: "Local control runtime remains bound to loopback.",
  });
  record(closed, manifest.updateAuthority === "mahoraga-verified-automatic", {
    id: "verified-automatic-update-authority",
    priority: "critical",
    summary: "Core updates use verified local automatic activation with rollback.",
  });
  record(closed, worker("browser")?.enabled === true, {
    id: "browser-worker-baseline",
    priority: "high",
    summary: "Bounded browser worker is enabled.",
  });
  record(closed, worker("repository")?.enabled === true, {
    id: "repository-worker-baseline",
    priority: "high",
    summary: "Repository worker is enabled.",
  });
  record(closed, worker("self-healer")?.enabled === true, {
    id: "automatic-operational-repair",
    priority: "high",
    summary: "Automatic operational and verified core repair are enabled with rollback.",
  });
  record(closed, manifest.featureFlags?.secondaryCodexMailbox === true, {
    id: "secondary-codex-mailbox",
    priority: "high",
    summary: "Outbound-only Secondary Codex coordination is enabled.",
  });
  record(closed, has(".github/workflows/chromebook-control-plane.yml"), {
    id: "chromebook-control-plane",
    priority: "high",
    summary: "Browser-only Chromebook control workflow is present.",
  });
  record(closed, has(".github/workflows/verify.yml"), {
    id: "cross-platform-ci",
    priority: "high",
    summary: "Canonical verification workflow is present.",
  });
  record(closed, has(".github/workflows/cloud-task-gateway.yml") && has("src/cloud-task-gateway.mjs") && has("test/cloud-task-gateway.test.mjs"), {
    id: "owner-approved-cloud-gateway",
    priority: "high",
    summary: "Public task intake is separated from exact owner-approved, idempotent Codex and desktop dispatch commands.",
  });
  record(closed, has(".github/workflows/release.yml") && has("src/update-contract.mjs") && has("test/update-contract.test.mjs"), {
    id: "verified-attested-update-channel",
    priority: "high",
    summary: "Owner-started releases are verified, SHA-256 bound, provenance-attested, and eligible for rollback-protected local automatic activation.",
  });
  record(closed, has("src/desktop-worker.mjs") && has("test/desktop-worker.test.mjs"), {
    id: "desktop-worker-contract",
    priority: "high",
    summary: "Desktop Worker process contract, fixed application allowlist, bounded focus action, and content-free receipts are implemented and tested.",
  });
  record(closed, has("src/microsoft-queue-worker.mjs") && has("test/microsoft-queue-worker.test.mjs"), {
    id: "microsoft-queue-readiness-contract",
    priority: "high",
    summary: "Microsoft queue readiness now fails closed, diagnoses silent Dataverse authentication non-interactively, and sanitizes poll receipts.",
  });
  record(closed, has("scripts/provider-readiness.mjs") && has("src/provider-readiness.mjs") && has("test/provider-readiness.test.mjs"), {
    id: "local-provider-readiness-probe",
    priority: "high",
    summary: "A single sanitized local probe can inspect desktop, Dataverse queue, LM Studio, Copilot CLI, Codex Builder, and Workspace Agent readiness without activating providers.",
  });
  record(closed, has("src/local-reasoner-provider.mjs") && has("test/local-reasoner-provider.test.mjs"), {
    id: "local-reasoner-health-contract",
    priority: "medium",
    summary: "LM Studio readiness is probed only on loopback and returns model counts without model identifiers or generated content.",
  });
  record(closed, manifest.featureFlags?.openAIProvider === false, {
    id: "no-default-metered-openai-api",
    priority: "high",
    summary: "Metered OpenAI API provider remains disabled by default; subscription-backed Codex lanes remain preferred.",
  });

  gap(open, worker("desktop")?.enabled !== true, {
    id: "desktop-worker",
    priority: "high",
    state: "blocked",
    summary: "Desktop Worker contract is prepared but production activation is not yet proven.",
    dependency: "Run npm run providers:probe on the live attended Windows host, verify the Desktop readiness result, then explicitly activate the worker. The current interaction contract is intentionally limited to focusing exactly one allowlisted Chrome, Edge, Excel, Word, PowerPoint, or Visio window.",
  });
  gap(open, manifest.browser?.signedSessionEnabled !== true, {
    id: "signed-browser-session",
    priority: "high",
    state: "blocked",
    summary: "Signed-in Chrome session control is not active.",
    dependency: "Owned signed-session provider, deterministic verification receipts, and live-machine activation.",
  });
  gap(open, manifest.featureFlags?.microsoftQueueWorker !== true, {
    id: "microsoft-durable-queue",
    priority: "high",
    state: "blocked",
    summary: "Microsoft durable queue code and unattended-readiness diagnostics are prepared, but production polling is not active.",
    dependency: queueDependency(manifest),
  });
  gap(open, worker("local-reasoner")?.enabled !== true, {
    id: "local-reasoner",
    priority: "medium",
    state: "blocked",
    summary: "Local reasoning provider execution is not active, although loopback readiness diagnostics are now implemented.",
    dependency: "Run npm run providers:probe on the live Windows host to prove LM Studio/model availability. Functional reasoning still requires a transient result channel that does not persist prompts or model responses before the worker can be activated.",
  });
  gap(open, manifest.featureFlags?.primaryCodexBuilder !== true || worker("primary-codex-builder")?.adapter?.directExecutionEnabled !== true, {
    id: "primary-codex-builder",
    priority: "medium",
    state: "open",
    summary: "Direct local Primary Codex Builder execution remains disabled.",
    dependency: "Run npm run providers:probe to refresh the local invocation state. A supported subscription-authenticated local execution contract is still required; existing Secondary Codex and Codex Cloud lanes remain the fallback.",
  });
  gap(open, manifest.featureFlags?.githubCopilotWorker !== true, {
    id: "github-copilot-worker",
    priority: "low",
    state: "optional",
    summary: "GitHub Copilot CLI worker is declared but disabled.",
    dependency: "Run npm run providers:probe for local CLI presence; authentication/quota still require an approved live provider task before activation.",
  });
  gap(open, manifest.featureFlags?.workspaceAgentCloud !== true, {
    id: "workspace-agent-cloud",
    priority: "low",
    state: "optional",
    summary: "Workspace Agent cloud trigger is declared but disabled.",
    dependency: "Run npm run providers:probe for credential-state diagnostics. Admin-provisioned Workspace Agent credentials are separate from ChatGPT Plus/Codex authentication.",
  });

  const priorityRank = new Map([["critical", 0], ["high", 1], ["medium", 2], ["low", 3]]);
  open.sort((left, right) => (priorityRank.get(left.priority) ?? 9) - (priorityRank.get(right.priority) ?? 9) || left.id.localeCompare(right.id));
  closed.sort((left, right) => (priorityRank.get(left.priority) ?? 9) - (priorityRank.get(right.priority) ?? 9) || left.id.localeCompare(right.id));

  return Object.freeze({
    schemaVersion: 1,
    product: manifest.product,
    version: manifest.version,
    scope: "repository-declared-state-only",
    liveWindowsRuntimeVerified: false,
    generatedAt: new Date().toISOString(),
    counts: { open: open.length, closed: closed.length },
    open,
    closed,
    note: "This audit does not claim live Windows process, browser-session, desktop, local-model, or tenant-authentication health.",
  });
}

function record(target, condition, item) {
  if (condition) target.push(Object.freeze({ ...item, state: "closed" }));
}

function gap(target, condition, item) {
  if (condition) target.push(Object.freeze({ ...item }));
}

function queueDependency(manifest) {
  const queue = manifest.queue ?? {};
  if (String(queue.state ?? "").includes("awaiting-authentication")) {
    return `Run npm run providers:probe on the live Windows host and establish a silent Dataverse credential for ${queue.environmentName ?? "the configured environment"}/${queue.solutionName ?? "the configured solution"}; then validate one outbound poll before activation.`;
  }
  return "Run npm run providers:probe on the live Windows host, prove a silent Dataverse credential, and validate one outbound poll before activation.";
}
