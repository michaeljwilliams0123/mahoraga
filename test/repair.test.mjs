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
    ".github/workflows/chromebook-control-plane.yml",
    ".github/workflows/autonomous-integration.yml",
    ".github/workflows/codex-cloud-dispatch.yml",
    ".github/workflows/cloud-task-gateway.yml",
    ".github/workflows/destiny-codex-relay.yml",
    ".github/workflows/release.yml",
    ".github/workflows/verify.yml",
    "src/github-audit.mjs",
    "src/destiny-codex-dispatch.mjs",
    "src/autonomy-policy.mjs",
    "src/autonomy-orchestrator.mjs",
    "src/autonomous-integration.mjs",
    "scripts/github-audit.mjs",
    "scripts/destiny-codex-dispatch.mjs",
    "scripts/autonomous-integration.mjs",
    "docs/DESTINY-CODEX-RELAY.md",
    "docs/GITHUB-CODEX-COORDINATION.md",
    "docs/ZERO-CREDIT-AUTOMATION.md",
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
    assert.deepEqual(scan.issues.filter((issue) => issue.relative === relative), [{ code: "baseline-file-out-of-date", relative }]);
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
