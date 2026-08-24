import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

const file = path.join(ROOT, ".github", "workflows", "chromebook-control-plane.yml");

async function workflow() {
  return readFile(file, "utf8");
}

test("Chromebook control plane keeps owner gate and supported command modes", async () => {
  const source = await workflow();
  assert.match(source, /workflow_dispatch:/);
  for (const mode of ["status", "verify", "gap-audit", "secondary-assignment", "codex-cloud-task"]) {
    assert.match(source, new RegExp(`- ${mode.replaceAll("-", "\\-")}`));
  }
  assert.match(source, /github\.actor == github\.repository_owner/);
  assert.match(source, /actions\/checkout@[a-f0-9]{40} # v7/);
  assert.match(source, /actions\/setup-node@[a-f0-9]{40} # v7/);
  assert.match(source, /node-version:\s*"24"/);
  assert.match(source, /github-audit\.mjs --format markdown >> "\$GITHUB_STEP_SUMMARY"/);
});

test("Chromebook control plane remains subscription-first and tunnel-free", async () => {
  const source = await workflow();
  assert.match(source, /subscription-backed Codex cloud task/);
  assert.doesNotMatch(source, /OPENAI_API_KEY/);
  assert.doesNotMatch(source, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(source, /ngrok|reverse tunnel|0\.0\.0\.0|public listener/i);
  assert.match(source, /git pull --rebase origin main/);
  assert.match(source, /node scripts\/coordination\.mjs validate/);
});
