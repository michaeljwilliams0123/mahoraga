import { existsSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./config.mjs";

export function buildGapAudit(manifest, { root = ROOT, fileExists = existsSync } = {}) {
  if (!manifest || typeof manifest !== "object") throw new TypeError("Manifest is required for gap audit.");

  const worker = (id) => manifest.workers?.find((item) => item.id === id) ?? null;
  const connection = (id) => manifest.connections?.find((item) => item.id === id) ?? null;
  const has = (relative) => fileExists(path.join(root, ...relative.split("/")));

  const closed = [];
  const open = [];

  record(closed, manifest.runtime?.host === "127.0.0.1", {
    id: "localhost-runtime-boundary",
    priority: "critical",
    summary: "Local control runtime remains bound to loopback.",
  });
  record(closed, manifest.updateAuthority === "user-only", {
    id: "owner-update-authority",
    priority: "critical",
    summary: "Core update activation remains owner-only.",
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
    summary: "Automatic operational repair is enabled below the core-update boundary.",
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
  record(closed, manifest.featureFlags?.openAIProvider === false, {
    id: "no-default-metered-openai-api",
    priority: "high",
    summary: "Metered OpenAI API provider remains disabled by default; subscription-backed Codex lanes remain preferred.",
  });

  gap(open, worker("desktop")?.enabled !== true, {
    id: "desktop-worker",
    priority: "high",
    state: "blocked",
    summary: "Desktop interaction worker is not active.",
    dependency: "Windows process contract, application allowlist, attended-session receipts, and live-machine validation.",
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
    summary: "Dataverse/Microsoft durable queue worker is not active.",
    dependency: queueDependency(manifest),
  });
  gap(open, worker("local-reasoner")?.enabled !== true, {
    id: "local-reasoner",
    priority: "medium",
    state: "blocked",
    summary: "Local reasoning provider is not active.",
    dependency: "Fresh local LM Studio/provider probe and live worker activation.",
  });
  gap(open, manifest.featureFlags?.primaryCodexBuilder !== true || worker("primary-codex-builder")?.adapter?.directExecutionEnabled !== true, {
    id: "primary-codex-builder",
    priority: "medium",
    state: "open",
    summary: "Direct local Primary Codex Builder execution remains disabled.",
    dependency: "Supported subscription-authenticated local execution contract; existing Secondary Codex and Codex Cloud lanes remain the fallback.",
  });
  gap(open, manifest.featureFlags?.githubCopilotWorker !== true, {
    id: "github-copilot-worker",
    priority: "low",
    state: "optional",
    summary: "GitHub Copilot CLI worker is declared but disabled.",
    dependency: "Live provider health/authentication probe before activation.",
  });
  gap(open, manifest.featureFlags?.workspaceAgentCloud !== true, {
    id: "workspace-agent-cloud",
    priority: "low",
    state: "optional",
    summary: "Workspace Agent cloud trigger is declared but disabled.",
    dependency: "Admin-provisioned workspace-agent credential; this is separate from ChatGPT Plus/Codex authentication.",
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
    return `Dataverse authentication remains pending for ${queue.environmentName ?? "the configured environment"}/${queue.solutionName ?? "the configured solution"}.`;
  }
  return "Live Dataverse authentication and queue health validation are required before activation.";
}
