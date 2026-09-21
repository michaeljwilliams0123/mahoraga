import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

const file = path.join(ROOT, ".github", "workflows", "verify.yml");
const packageFile = path.join(ROOT, "package.json");

async function workflow() {
  return (await readFile(file, "utf8")).replaceAll("\r\n", "\n");
}

test("canonical CI verifies Linux and Windows with Node 24", async () => {
  const source = await workflow();
  assert.match(source, /pull_request:/);
  assert.match(source, /push:\s*\n\s+branches:\s*\[main\]/);
  assert.match(source, /name:\s*Verify \(\$\{\{ matrix\.check_name \}\}\)/);
  assert.match(source, /check_name:\s*ubuntu-latest/);
  assert.match(source, /runner_labels:\s*'"ubuntu-latest"'/);
  assert.match(source, /name:\s*Verify Ubuntu runner identity/);
  assert.match(source, /source \/etc\/os-release/);
  assert.match(source, /test "\$ID" = "ubuntu"/);
  assert.match(source, /check_name:\s*windows-latest/);
  assert.match(source, /runner_labels:\s*'"windows-latest"'/);
  assert.doesNotMatch(source, /self-hosted/);
  assert.match(source, /actions\/checkout@[a-f0-9]{40} # v7/);
  assert.match(source, /actions\/setup-node@[a-f0-9]{40} # v7/);
  assert.match(source, /node-version:\s*"24"/);
  assert.match(source, /npm run verify:fast/);
  assert.doesNotMatch(source, /npm run verify -- --test-concurrency=1/);
  assert.match(source, /npm run gap:audit/);
  assert.match(source, /github-audit\.mjs --format markdown >> "\$GITHUB_STEP_SUMMARY"/);
  assert.match(source, /if: matrix\.check_name == 'ubuntu-latest'/);
});

test("fast Verify retains exact-head governance and focused regression coverage", async () => {
  const pkg = JSON.parse(await readFile(packageFile, "utf8"));
  const fast = pkg.scripts?.["verify:fast"];
  assert.equal(typeof fast, "string");
  for (const required of [
    "npm run language:verify",
    "node src/cli.mjs validate",
    "node scripts/product-identity.mjs validate",
    "node scripts/coordination.mjs validate",
    "node scripts/codex-github-handshake.mjs validate",
    "node scripts/github-audit.mjs",
    "node scripts/github-live-protection.mjs",
    "node scripts/pdf-authority-verify.mjs",
    "node scripts/create-release-baseline.mjs --verify",
    "test/verification-workflow.test.mjs",
    "test/github-live-protection.test.mjs",
    "test/release-baseline.test.mjs",
    "test/repository-head.test.mjs",
    "test/autonomous-integration.test.mjs",
    "test/return-reconciler.test.mjs",
    "test/composio-tool-client.test.mjs",
    "cloud-app/test/composio-integration-contract.test.mjs",
    "test/workspace-agent-receiver.test.mjs",
    "test/destiny-trigger-trust.test.mjs",
    "test/mahoraga-core-types.test.ts",
    "test/verification-pipeline.test.ts",
  ]) assert.match(fast, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(fast, /cli-runtime-database-target\.test\.mjs/);
  assert.match(pkg.scripts?.verify ?? "", /node --test --test-isolation=none/);
});

test("canonical CI remains read-only", async () => {
  const source = await workflow();
  const block = source.match(/\npermissions:\n([\s\S]*?)\nconcurrency:/)?.[1];
  assert.ok(block, "permissions block missing");
  assert.deepEqual(block.trim().split(/\n/).map((line) => line.trim()).filter(Boolean), ["contents: read"]);
  assert.doesNotMatch(source, /\$\{\{\s*secrets\./);
});
