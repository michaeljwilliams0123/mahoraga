import { existsSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./config.mjs";

export function buildGapAudit(manifest, { root = ROOT, fileExists = existsSync, evidence = {} } = {}) {
  if (!manifest || typeof manifest !== "object") throw new TypeError("Manifest is required for gap audit.");

  const worker = (id) => manifest.workers?.find((item) => item.id === id) ?? null;
  const has = (relative) => fileExists(path.join(root, ...relative.split("/")));

  const closed = [];
  const open = [];
  const record = (target, condition, item) => {
    if (!condition) return;
    const proof = auditProof(item.id, evidence);
    if (proof?.verified === true) {
      target.push(Object.freeze({ ...item, state: "closed", evidenceLevel: "verified", lastVerifiedAt: proof.verifiedAt ?? null, verifier: proof.verifier ?? "contract-evidence" }));
      return;
    }
    target.push(Object.freeze({
      ...item,
      state: "closed",
      evidenceLevel: "contract",
      lastVerifiedAt: null,
      verifier: "contract-declaration",
      supportingEvidence: "Repository file or manifest declaration is present.",
    }));
  };

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
  record(closed, !has(".github/workflows/chromebook-control-plane.yml"), {
    id: "chromebook-control-plane-retired",
    priority: "high",
    summary: "Chromebook control plane remains retired; GitHub Actions Verify is the credit-free scheduler.",
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
    summary: "Ollama and LM Studio readiness are probed only on loopback and return model counts without model identifiers or generated content.",
  });
  record(closed, has("src/autonomy-heartbeat.mjs") && has("test/autonomy-heartbeat.test.mjs") && has("src/credit-free-autonomy.mjs"), {
    id: "credit-free-heartbeat",
    priority: "high",
    summary: "Unattended credit-free heartbeat refuses paid fallback, holds planned when hosted compute is exhausted, and folds Destiny trigger unreadiness without buying a probe.",
  });
  record(closed, has("src/heartbeat-ledger.mjs") && has("test/heartbeat-ledger.test.mjs"), {
    id: "credit-free-heartbeat-ledger",
    priority: "medium",
    summary: "Append-only content-free heartbeat ledger compounds method identifiers and Destiny unreadiness at $0.",
  });
  record(closed, has("src/unattended-cycle-memory.mjs") && has("test/unattended-cycle-memory.test.mjs"), {
    id: "unattended-cycle-memory",
    priority: "high",
    summary: "File-backed content-free cycle memory persists receipts and admitted specialists outside Git so unattended compounding survives process restart.",
  });
  record(closed, has("src/unattended-cycle-memory.mjs") && has("test/unattended-cycle-memory.test.mjs") && has(".github/workflows/sovereign-eight-hour-cycle.yml"), {
    id: "unattended-scheduler-memory",
    priority: "high",
    summary: "Four-hour cycle restores and saves content-free cycle memory through Actions cache so compounding survives ephemeral runners without writing Git.",
  });
  record(closed, has("src/unattended-generation-admit.mjs") && has("test/unattended-generation-admit.test.mjs"), {
    id: "unattended-generation-admit",
    priority: "high",
    summary: "Unattended generation arms only when a live loopback reasoner is verified or an explicit flag is set; the four-hour Actions cycle stays inspect-only.",
  });
  record(closed, has(".github/workflows/steward-two-hour-learning.yml") && has("scripts/steward-learning-cycle.mjs") && has("scripts/steward-agent-foundry.mjs") && has("src/steward-learning-state.mjs") && has("src/steward-foundry-report.mjs"), {
    id: "steward-two-hour-learning",
    priority: "high",
    summary: "Two-hour steward foundry report carries schemaVersion 1 so empty plans hold at $0 instead of crashing the scheduler.",
  });
  record(closed, has("src/destiny-trigger-trust.mjs") && has("test/destiny-trigger-trust.test.mjs") && has("config/destiny-trigger-trust.json"), {
    id: "destiny-trigger-trust",
    priority: "high",
    summary: "Destiny signed-receipt trust is fail-closed: canonical Ed25519 only, owner comments are not execution proof, and unknown identity does not buy a probe.",
  });
  record(closed, has("src/local-reasoner-channel.mjs") && has("test/local-reasoner-channel.test.mjs"), {
    id: "local-reasoner-channel",
    priority: "high",
    summary: "Transient memory-only result channel admits local generation without persisting prompts or buying a cloud key.",
  });
  record(closed, has("src/unattended-credit-free-cycle.mjs") && has("test/unattended-credit-free-cycle.test.mjs") && has("src/credit-free-skill-compound.mjs") && has("src/unattended-foundry-admit.mjs"), {
    id: "unattended-credit-free-cycle",
    priority: "high",
    summary: "Unattended dual loop compounds identifier-only skills and admits foundry specialists at $0 without writing Git.",
  });
  record(closed, has("src/github-live-protection.mjs") && has("config/main-protection.contract.json") && has("test/github-live-protection.test.mjs"), {
    id: "github-live-main-protection",
    priority: "high",
    summary: "Live main-protection contract requires exact-head Ubuntu and Windows Verify. Extra required checks, including observational Vercel, fail closed. File presence is not enforcement.",
  });
  record(closed, has("src/stale-pr-ledger.mjs") && has("test/stale-pr-ledger.test.mjs") && has("src/sovereign-candidate-producer.mjs"), {
    id: "sovereign-cycle-hold-noop",
    priority: "high",
    summary: "CycleId-only sovereign ledger pulses hold at $0 instead of opening a PR. Stale ledger-only PRs are close-eligible. The Actions step summary is the pulse.",
  });
  record(closed, has("src/destiny-trigger-trust.mjs") && has("src/destiny-event-delivery.mjs") && has("test/destiny-event-delivery.test.mjs"), {
    id: "destiny-event-delivery-matrix",
    priority: "high",
    summary: "Owner, GitHub App, synchronize, reopen, and edited events are classified separately for GitHub validation vs Destiny delivery, with duplicate suppression and dead-letter path restrictions.",
  });
  record(closed, has("src/destiny-trigger-metrics.mjs") && has("test/destiny-trigger-metrics.test.mjs"), {
    id: "destiny-trigger-metrics",
    priority: "medium",
    summary: "Bounded Destiny trigger metrics track dispatch, validation, latency, duplicates, and expiry without prompts, chats, or credentials.",
  });
  record(closed, has("src/branch-cleanup-ledger.mjs") && has("test/branch-cleanup-ledger.test.mjs"), {
    id: "branch-cleanup-ledger",
    priority: "medium",
    summary: "Wave A contained branches are delete-eligible after a fresh ahead_by=0 comparison, or when a merged PR attests squash/merge/rebase leftover unique SHAs. Wave B stays reconcile-only. No open PR. Non-protected.",
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
    dependency: "Run npm run providers:probe on the live Windows host to prove Ollama or LM Studio model availability. Functional reasoning still requires a transient result channel that does not persist prompts or model responses before the worker can be activated.",
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
    scope: "evidence-backed-contract-and-runtime-state",
    liveWindowsRuntimeVerified: evidence.runtime?.verified === true,
    generatedAt: new Date().toISOString(),
    counts: { open: open.length, closed: closed.length },
    open,
    closed,
    note: "File presence and manifest declarations close contract gaps. Live Windows runtime gaps remain blocked until a fresh verified observation.",
  });
}

function gap(target, condition, item) {
  if (condition) target.push(Object.freeze({ ...item, evidenceLevel: "unknown", lastVerifiedAt: null }));
}

function auditProof(id, evidence) {
  const contract = evidence.contracts?.[id];
  if (contract?.verified === true) return { verified: true, verifiedAt: contract.verifiedAt ?? null, verifier: contract.verifier ?? "contract-test" };
  const workerByControl = new Map([["browser-worker-baseline", "browser"], ["repository-worker-baseline", "repository"]]);
  const workerId = workerByControl.get(id);
  if (workerId) {
    const route = evidence.capabilities?.find((item) => item.workerId === workerId && item.routable === true && item.evidenceLevel === "verified");
    if (route) return { verified: true, verifiedAt: route.lastVerifiedAt, verifier: `${workerId}-runtime-canary` };
  }
  if (id === "automatic-operational-repair" && evidence.repairScan?.healthy === true && evidence.repairScan.lastVerifiedAt) return { verified: true, verifiedAt: evidence.repairScan.lastVerifiedAt, verifier: "repair-scan" };
  if (id === "localhost-runtime-boundary" && evidence.runtime?.verified === true && evidence.runtime.host === "127.0.0.1") return { verified: true, verifiedAt: evidence.runtime.verifiedAt ?? null, verifier: "runtime-observation" };
  return null;
}

function queueDependency(manifest) {
  const queue = manifest.queue ?? {};
  if (String(queue.state ?? "").includes("awaiting-authentication")) {
    return `Run npm run providers:probe on the live Windows host and establish a silent Dataverse credential for ${queue.environmentName ?? "the configured environment"}/${queue.solutionName ?? "the configured solution"}; then validate one outbound poll before activation.`;
  }
  return "Run npm run providers:probe on the live Windows host, prove a silent Dataverse credential, and validate one outbound poll before activation.";
}
