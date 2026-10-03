import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { providerFreshEnough } from "../scripts/cloudflare-provider-renewal-watchdog.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(root, "scripts/cloudflare-provider-renewal-watchdog.mjs");
const workflowPath = path.join(root, ".github/workflows/cloudflare-execution-runtime.yml");

const SHA = "0537edc5ef0866ddd576b1531868ebf84341327a";
const NOW = 1_800_000_000_000;
const MARGIN = 30 * 60_000;

const runtime = (overrides = {}) => {
  const { provider: providerOverrides = {}, ...topLevelOverrides } = overrides;
  return {
    status: "ready",
    targetSha: SHA,
    provider: {
      providerId: "cloudflare-workers-ai",
      admitted: true,
      zeroCreditEligible: true,
      verifiedAt: NOW - 1_000,
      canaryExpiresAt: NOW + MARGIN + 1,
      ...providerOverrides,
    },
    ...topLevelOverrides,
  };
};

test("provider watchdog requires exact current lineage and margin, not merely unexpired state", () => {
  assert.equal(providerFreshEnough(runtime(), NOW, MARGIN, SHA), true);
  assert.equal(providerFreshEnough(runtime({ provider: { canaryExpiresAt: NOW + MARGIN } }), NOW, MARGIN, SHA), false);
  assert.equal(providerFreshEnough(runtime({ targetSha: "a".repeat(40) }), NOW, MARGIN, SHA), false);
  assert.equal(providerFreshEnough(runtime({ provider: { zeroCreditEligible: false } }), NOW, MARGIN, SHA), false);
  assert.equal(providerFreshEnough(runtime({ provider: { providerId: "other" } }), NOW, MARGIN, SHA), false);
});

test("bounded renewal watchdog preserves zero-cost and no-authority-expansion constraints", async () => {
  const [script, workflow] = await Promise.all([
    readFile(scriptPath, "utf8"),
    readFile(workflowPath, "utf8"),
  ]);
  assert.match(workflow, /timeout-minutes:\s*330/);
  assert.match(workflow, /WATCHDOG_INTERVAL_MS:\s*300000/);
  assert.match(workflow, /WATCHDOG_DURATION_MS:\s*19200000/);
  assert.match(workflow, /node scripts\/cloudflare-provider-renewal-watchdog\.mjs/);
  assert.doesNotMatch(workflow, /actions:\s*write/);
  assert.match(script, /provider-watchdog-public-zero-cost-required/);
  assert.match(script, /\/branches\/main/);
  assert.match(script, /provider-watchdog-source-advanced/);
  assert.match(script, /fetchZeroCreditBillingEvidence/);
  assert.match(script, /buildZeroCreditBillingAttestation/);
  assert.match(script, /\/api\/provider\/refresh/);
  assert.match(script, /provider-watchdog-post-renewal-freshness-unverified/);
  assert.match(script, /provider-watchdog-renewal-margin-immutable/);
  assert.doesNotMatch(script, /railway|vercel/i);
});
