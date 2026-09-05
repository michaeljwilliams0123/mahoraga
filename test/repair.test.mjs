import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest } from "../src/config.mjs";
import { applyAutomaticRepairs, ESSENTIAL_FILES, scanRepairState } from "../src/repair.mjs";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

test("release baseline covers GitHub governance and automation controls", () => {
  for (const relative of [
    "AGENTS.md",
    "SECURITY.md",
    ".githooks/pre-push",
    ".github/CODEOWNERS",
    ".github/dependabot.yml",
    ".github/pull_request_template.md",
    ".github/ai-instructions.md",
    ".github/copilot-instructions.md",
    ".github/instructions/typescript-ui.instructions.md",
    ".github/workflows/autonomous-integration.yml",
    ".github/workflows/codex-cloud-dispatch.yml",
    ".github/workflows/cloud-task-gateway.yml",
    ".github/workflows/destiny-codex-relay.yml",
    ".github/workflows/release.yml",
    ".github/workflows/verify.yml",
    ".github/workflows/steward-two-hour-learning.yml",
    "src/github-audit.mjs",
    "src/destiny-codex-dispatch.mjs",
    "src/destiny-trigger-trust.mjs",
    "src/autonomy-policy.mjs",
    "src/autonomy-orchestrator.mjs",
    "src/credit-free-autonomy.mjs",
    "src/autonomy-heartbeat.mjs",
    "src/local-reasoner-provider.mjs",
    "src/local-reasoner-channel.mjs",
    "src/local-reasoner-generate.mjs",
    "src/local-reasoner-loopback-invoke.mjs",
    "src/credit-free-skill-compound.mjs",
    "src/agent-foundry.mjs",
    "src/unattended-foundry-admit.mjs",
    "src/unattended-credit-free-cycle.mjs",
    "src/unattended-cycle-memory.mjs",
    "src/unattended-generation-admit.mjs",
    "src/steward-learning-state.mjs",
    "src/steward-foundry-report.mjs",
    "src/heartbeat-ledger.mjs",
    "src/autonomous-integration.mjs",
    "scripts/github-audit.mjs",
    "src/control-session.mjs",
    "src/task-policy.mjs",
    "src/receipt-registry.mjs",
    "src/capability-readiness.mjs",
    "src/execution-cell.mjs",
    "src/content-vault.mjs",
    "src/repair-incidents.mjs",
    "scripts/content-vault-key.ps1",
    "scripts/open-workspace.ps1",
    "scripts/create-release-baseline.mjs",
    "scripts/steward-learning-cycle.mjs",
    "scripts/steward-agent-foundry.mjs",
    "scripts/destiny-codex-dispatch.mjs",
    "scripts/destiny-trigger-health.mjs",
    "scripts/autonomous-integration.mjs",
    "docs/DESTINY-CODEX-RELAY.md",
    "docs/DESTINY-EVENT-DISPATCH-LANE.md",
    "docs/CLOUD-ONLY-DEPLOYMENT.md",
    "docs/ECOSYSTEM-LOCK.md",
    "docs/GITHUB-CODEX-COORDINATION.md",
    "docs/ZERO-CREDIT-AUTOMATION.md",
    "docs/CREDIT-FREE-AUTONOMY.md",
    "src/incumbent-trust-epoch.mjs",
    "src/github-live-protection.mjs",
    "src/sovereign-evolution.mjs",
    "config/main-protection.contract.json",
    "config/destiny-trigger-trust.json",
    "state/incumbent-trust-epoch.json",
    "src/run-event-contract.mjs",
    "src/conversation-gateway.mjs",
    "src/relay-client.mjs",
    "src/relay-runtime.mjs",
    "src/destiny-event-delivery.mjs",
    "src/destiny-trigger-metrics.mjs",
    "src/branch-cleanup-ledger.mjs",
    "src/stale-pr-ledger.mjs",
    "src/openclaw-adapter.mjs",
    "src/mcp-host-manager.mjs",
    "src/evidence-compiler.mjs",
    "src/bounded-execution.mjs",
    "src/observational-memory.mjs",
    "src/generated-code-safety.mjs",
    "src/evolution-controller.mjs",
    "relay/core.mjs",
    "relay/cloudflare-worker.mjs",
    "relay/wrangler.toml",
  ]) assert.ok(ESSENTIAL_FILES.includes(relative), `${relative} is missing from the release baseline`);
});

test("release baseline covers every essential production file", async () => {
  const manifest = await loadManifest();
  const scan = await scanRepairState(manifest);
  assert.equal(scan.healthy, true, JSON.stringify(scan.issues));
});

test("release baseline rejects stale production copies", async () => {
  const manifest = await loadManifest();
  const relative = `state/repair-drift-test-${Date.now()}/core.mjs`;
  const live = path.join(process.cwd(), relative);
  const baseline = path.join(process.cwd(), manifest.repair.baselineDirectory, relative);
  try {
    mkdirSync(path.dirname(live), { recursive: true });
    mkdirSync(path.dirname(baseline), { recursive: true });
    writeFileSync(live, "current-production", "utf8");
    writeFileSync(baseline, "obsolete-production", "utf8");
    ESSENTIAL_FILES.push(relative);
    const scan = await scanRepairState(manifest);
    assert.equal(scan.healthy, false);
    const issue = scan.issues.find((item) => item.relative === relative);
    assert.equal(issue.code, "baseline-file-out-of-date");
    assert.match(issue.expectedSha256, /^[a-f0-9]{64}$/);
    assert.match(issue.observedSha256, /^[a-f0-9]{64}$/);
  } finally {
    ESSENTIAL_FILES.pop();
    rmSync(path.dirname(live), { recursive: true, force: true });
    rmSync(path.dirname(baseline), { recursive: true, force: true });
  }
});

test("core repair defects are automatically restored with a verification receipt", async () => {
  const manifest = await loadManifest();
  const relative = `state/repair-test-${Date.now()}/core.mjs`;
  const baseline = path.join(process.cwd(), manifest.repair.baselineDirectory, relative);
  try {
    mkdirSync(path.dirname(baseline), { recursive: true });
    writeFileSync(baseline, "baseline", "utf8");
    ESSENTIAL_FILES.push(relative);
    const result = await applyAutomaticRepairs(manifest);
    assert.deepEqual(result.repaired, [relative]);
    assert.deepEqual(result.staged, []);
    assert.equal(await import("node:fs/promises").then(({ readFile }) => readFile(path.join(process.cwd(), relative), "utf8")), "baseline");
  } finally {
    ESSENTIAL_FILES.pop();
    rmSync(path.dirname(path.join(process.cwd(), relative)), { recursive: true, force: true });
    rmSync(path.dirname(baseline), { recursive: true, force: true });
  }
});
