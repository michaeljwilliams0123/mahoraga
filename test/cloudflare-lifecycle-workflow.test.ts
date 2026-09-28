import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("manual exact-head workflow runs deterministic gate and unconditional cleanup", () => {
  const text = readFileSync(join(process.cwd(), ".github/workflows/cloudflare-lifecycle-evaluation.yml"), "utf8");
  assert.match(text, /workflow_dispatch:/);
  assert.doesNotMatch(text, /^\s+(push|pull_request|schedule):/m);
  assert.match(text, /environment: cloudflare-lifecycle-test/);
  assert.match(text, /timeout-minutes: 30/);
  assert.match(text, /permissions:\s*\n\s*contents: read/);
  assert.match(text, /github\.actor == github\.repository_owner/);
  assert.match(text, /node-version: ['"]?24/);
  assert.match(text, /git rev-parse HEAD/);
  assert.match(text, /check-runs/);
  assert.match(text, /Verify \(ubuntu-latest\)/);
  assert.match(text, /Verify \(windows-latest\)/);
  assert.match(text, /npm run test:lifecycle/);
  assert.match(text, /cloudflare:lifecycle:run/);
  assert.match(text, /if: always\(\)/);
  assert.match(text, /cloudflare:lifecycle:cleanup/);
  assert.doesNotMatch(text, /worker_name:|config_path:|provider_api_key:/);
});
