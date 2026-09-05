import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config.mjs";

export const ESSENTIAL_FILES = [
  "AGENTS.md",
  "SECURITY.md",
  ".githooks/pre-push",
  ".github/CODEOWNERS",
  ".github/dependabot.yml",
  ".github/ISSUE_TEMPLATE/codex-cloud-task.yml",
  ".github/pull_request_template.md",
  ".github/ai-instructions.md",
  ".github/copilot-instructions.md",
  ".github/instructions/typescript-ui.instructions.md",
  ".github/workflows/autonomous-integration.yml",
  ".github/workflows/chromebook-control-plane.yml",
  ".github/workflows/codex-cloud-dispatch.yml",
  ".github/workflows/cloud-task-gateway.yml",
  ".github/workflows/destiny-codex-relay.yml",
  ".github/workflows/release.yml",
  ".github/workflows/verify.yml",
  ".github/workflows/workspace-agent-receiver.yml",
  "mahoraga.manifest.json",
  "package.json",
  "src/cli.mjs",
  "src/answer-quality.mjs",
  "src/control-session.mjs",
  "src/task-policy.mjs",
  "src/receipt-registry.mjs",
  "src/capability-readiness.mjs",
  "src/capability-registry.mjs",
  "src/execution-cell.mjs",
  "src/content-vault.mjs",
  "src/coordination-mailbox.mjs",
  "src/coordination-records.mjs",
  "src/codex-cloud-contract.mjs",
  "src/destiny-codex-dispatch.mjs",
  "src/controller-authority.mjs",
  "src/cloud-task-gateway.mjs",
  "src/codex-builder-worker.mjs",
  "src/autonomy-policy.mjs",
  "src/autonomy-execution-scope.mjs",
  "src/autonomy-orchestrator.mjs",
  "src/objective-release-authority.mjs",
  "src/autonomous-integration.mjs",
  "src/copilot-worker.mjs",
  "src/config.mjs",
  "src/local-auth.mjs",
  "src/local-artifact-store.mjs",
  "src/browser-worker.mjs",
  "src/database.mjs",
  "src/expert-skill-registry.mjs",
  "src/github-audit.mjs",
  "src/microsoft365-worker.mjs",
  "src/microsoft-queue-worker.mjs",
  "src/repair-incidents.mjs",
  "src/repair.mjs",
  "src/router.mjs",
  "src/repository-worker.mjs",
  "src/secondary-codex-runner.mjs",
  "src/secondary-runner-status.mjs",
  "src/runtime.mjs",
  "src/server.mjs",
  "src/supervisor.mjs",
  "src/run-event-contract.mjs",
  "src/conversation-gateway.mjs",
  "src/relay-client.mjs",
  "src/relay-runtime.mjs",
  "src/openclaw-adapter.mjs",
  "src/mcp-host-manager.mjs",
  "src/evidence-compiler.mjs",
  "src/bounded-execution.mjs",
  "src/observational-memory.mjs",
  "src/generated-code-safety.mjs",
  "src/evolution-controller.mjs",
  "src/world-state-observer.mjs",
  "src/worker-process.mjs",
  "src/workspace-agent-worker.mjs",
  "src/update-contract.mjs",
  "docs/CLOUD-WORKSPACE.md",
  "docs/ECOSYSTEM-LOCK.md",
  "docs/CLOUD-ONLY-DEPLOYMENT.md",
  "docs/DESTINY-CODEX-RELAY.md",
  "docs/GITHUB-CODEX-COORDINATION.md",
  "docs/UPDATE-CHANNEL.md",
  "docs/ZERO-CREDIT-AUTOMATION.md",
  "scripts/auth.py",
  "scripts/coordination.mjs",
  "scripts/autonomous-integration.mjs",
  "scripts/github-audit.mjs",
  "scripts/workspace-agent.mjs",
  "scripts/workspace-agent-receiver.mjs",
  "scripts/codex-cloud-task.mjs",
  "scripts/destiny-codex-dispatch.mjs",
  "scripts/cloud-task-gateway.mjs",
  "scripts/update-manifest.mjs",
  "scripts/create-release-baseline.mjs",
  "scripts/content-vault-key.ps1",
  "scripts/open-workspace.ps1",
  "scripts/secondary-codex-runner.mjs",
  "scripts/connect-chatgpt-codex.ps1",
  "scripts/run-secondary-codex-runner.ps1",
  "scripts/install-secondary-codex-runner.ps1",
  "scripts/microsoft_queue_worker.py",
  "scripts/start-production.ps1",
  "relay/core.mjs",
  "relay/cloudflare-worker.mjs",
  "relay/wrangler.toml",
];

export async function scanRepairState(manifest) {
  const issues = [];
  const baselineRoot = path.join(ROOT, manifest.repair.baselineDirectory);
  const baselineVersion = `${manifest.version}:${manifest.repair.baselineDirectory}`;
  for (const relative of ESSENTIAL_FILES) {
    const live = path.join(ROOT, relative);
    const baseline = path.join(baselineRoot, relative);
    const liveHealthy = await healthyFile(live);
    const baselineHealthy = await healthyFile(baseline);
    const expectedSha256 = baselineHealthy ? await fileDigest(baseline) : null;
    const observedSha256 = liveHealthy ? await fileDigest(live) : null;
    const issue = (code) => ({ code, condition: code, relative, expectedSha256, observedSha256, baselineVersion });
    if (!liveHealthy) issues.push(issue("live-file-missing-or-empty"));
    if (!baselineHealthy) issues.push(issue("baseline-file-missing-or-empty"));
    if (liveHealthy && baselineHealthy && observedSha256 !== expectedSha256) issues.push(issue("baseline-file-out-of-date"));
  }
  return { issues, checked: ESSENTIAL_FILES.length, healthy: issues.length === 0, baselineVersion };
}

export async function applyAutomaticRepairs(manifest) {
  const repairId = `${Date.now()}-${process.pid}`;
  const rollbackRoot = path.join(ROOT, "state", "repairs", "rollback", repairId);
  await Promise.all(["state", "state/cache", "state/checkpoints", "state/repairs"].map((relative) => mkdir(path.join(ROOT, relative), { recursive: true })));
  const baselineRoot = path.join(ROOT, manifest.repair.baselineDirectory);
  const repaired = [];
  const rolledBack = [];
  const unresolved = [];
  for (const relative of ESSENTIAL_FILES) {
    const live = path.join(ROOT, relative);
    const baseline = path.join(baselineRoot, relative);
    if (await healthyFile(live)) continue;
    if (!(await healthyFile(baseline))) { unresolved.push(relative); continue; }
    const rollback = path.join(rollbackRoot, relative);
    const hadLiveFile = await fileExists(live);
    try {
      await mkdir(path.dirname(live), { recursive: true });
      if (hadLiveFile) {
        await mkdir(path.dirname(rollback), { recursive: true });
        await copyFile(live, rollback);
      }
      await copyFile(baseline, live);
      if (!(await healthyFile(live)) || !(await filesMatch(live, baseline))) throw new Error("post-activation verification failed");
      repaired.push(relative);
      const receipt = path.join(ROOT, "state", "repairs", `core-${repairId}-${relative.replace(/[\\/]/g, "_")}.json`);
      await writeFile(receipt, `${JSON.stringify({ kind: "core-source-repair", relative, baseline: path.relative(ROOT, baseline), activatedAt: new Date().toISOString(), activationAuthority: manifest.repair.coreUpdateAuthority, rollback: hadLiveFile ? path.relative(ROOT, rollback) : null, verified: true }, null, 2)}\n`, "utf8");
    } catch {
      try {
        if (hadLiveFile && await fileExists(rollback)) await copyFile(rollback, live);
        else await rm(live, { force: true });
        rolledBack.push(relative);
      } catch {
        unresolved.push(relative);
      }
      if (!unresolved.includes(relative)) unresolved.push(relative);
    }
  }
  return { verified: unresolved.length === 0, repaired, staged: [], rolledBack, unresolved, rollbackCheckpoint: repaired.length > 0 ? path.relative(ROOT, rollbackRoot) : null, summary: `Automatic repair completed; ${repaired.length} verified core repair(s) activated, ${rolledBack.length} rolled back, and ${unresolved.length} unresolved.` };
}

async function fileExists(file) {
  try { return (await stat(file)).isFile(); } catch { return false; }
}
async function healthyFile(file) {
  try { return (await stat(file)).isFile() && (await stat(file)).size > 0; } catch { return false; }
}
async function filesMatch(left, right) {
  const [leftSource, rightSource] = await Promise.all([readFile(left), readFile(right)]);
  return leftSource.equals(rightSource);
}
async function fileDigest(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}
