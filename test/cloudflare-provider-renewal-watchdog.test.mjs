import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  isTransientTransportError,
  providerFreshEnough,
  withTransientTransportRetry,
} from "../scripts/cloudflare-provider-renewal-watchdog.mjs";

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

test("provider watchdog retries recognized transient transport failure then recovers", async () => {
  let attempts = 0;
  let now = 0;
  const delays = [];

  const result = await withTransientTransportRetry(async ({ signal }) => {
    attempts += 1;
    assert.equal(signal instanceof AbortSignal, true);
    if (attempts === 1) {
      const cause = new Error("headers timeout");
      cause.code = "UND_ERR_HEADERS_TIMEOUT";
      const error = new TypeError("fetch failed");
      error.cause = cause;
      throw error;
    }
    return "recovered";
  }, {
    sleep: async (ms) => {
      delays.push(ms);
      now += ms;
    },
    nowFn: () => now,
    onRetry: () => {},
    attemptTimeoutMs: 1_000,
    maxElapsedMs: 10_000,
  });

  assert.equal(result, "recovered");
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [1_000]);
});

test("provider watchdog exhausts repeated transient failures and remains fail-closed", async () => {
  let attempts = 0;
  const timeout = new Error("socket timeout");
  timeout.code = "ETIMEDOUT";

  await assert.rejects(
    withTransientTransportRetry(async () => {
      attempts += 1;
      throw timeout;
    }, {
      sleep: async () => {},
      onRetry: () => {},
      attemptTimeoutMs: 1_000,
      maxElapsedMs: 10_000,
      maxAttempts: 3,
    }),
    /socket timeout/,
  );

  assert.equal(attempts, 3);
});

test("provider watchdog does not retry semantic authority failures", async () => {
  let attempts = 0;
  let retries = 0;

  await assert.rejects(
    withTransientTransportRetry(async () => {
      attempts += 1;
      throw new Error("provider-watchdog-runtime-authority-503:unverified");
    }, {
      sleep: async () => {},
      onRetry: () => {
        retries += 1;
      },
      attemptTimeoutMs: 1_000,
      maxElapsedMs: 10_000,
    }),
    /provider-watchdog-runtime-authority-503/,
  );

  assert.equal(attempts, 1);
  assert.equal(retries, 0);
  assert.equal(isTransientTransportError(new Error("semantic-failure")), false);
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
  assert.match(script, /UND_ERR_HEADERS_TIMEOUT/);
  assert.match(script, /AbortSignal\.timeout/);
  assert.match(script, /provider-watchdog-transient-retry/);
  assert.doesNotMatch(script, /railway|vercel/i);
});
