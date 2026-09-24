import assert from "node:assert/strict";
import test from "node:test";

import { probeZeroCreditProvider, providerStateFromProbe } from "../deploy/cloudflare-execution-runtime/provider-admission.ts";
import { ASSISTANT_MODEL_ID, ASSISTANT_PROVIDER_ID, type ZeroCreditProviderConfig } from "../deploy/cloudflare-execution-runtime/provider-invoker.ts";

const NOW = 1_790_208_000_000;
const config: ZeroCreditProviderConfig = {
  origin: "https://zero-credit.example/",
  token: "z".repeat(64),
  accountIdHash: "a".repeat(64),
  targetSha: "b".repeat(40),
};

const proof = (overrides: Record<string, unknown> = {}) => ({
  providerId: ASSISTANT_PROVIDER_ID,
  modelId: ASSISTANT_MODEL_ID,
  targetSha: config.targetSha,
  accountIdHash: config.accountIdHash,
  accountClass: "standalone-free",
  available: true,
  metered: false,
  priceUsd: 0,
  spendUsd: 0,
  billingState: "verified-zero",
  zeroDollarStopGuaranteed: true,
  observedAt: NOW,
  verifiedAt: NOW,
  canaryExpiresAt: NOW + 75 * 60_000,
  ...overrides,
});

const responseFetch = (body: Record<string, unknown>, status = 200): typeof fetch =>
  async () => Response.json(body, { status });

test("admits only a fresh identity-bound standalone-Free provider proof", async () => {
  const probe = await probeZeroCreditProvider(config, responseFetch(proof()), () => NOW);
  const state = providerStateFromProbe(probe, NOW);
  assert.equal(state.available, true);
  assert.equal(state.zeroCreditEligible, true);
  assert.equal(state.reasonCode, null);
  assert.equal(state.canaryExpiresAt, NOW + 75 * 60_000);
});

test("rejects a proof from the wrong Cloudflare account identity", async () => {
  const probe = await probeZeroCreditProvider(config, responseFetch(proof({ accountIdHash: "c".repeat(64) })), () => NOW);
  const state = providerStateFromProbe(probe, NOW);
  assert.equal(state.zeroCreditEligible, false);
  assert.equal(state.reasonCode, "provider-identity-mismatch");
});

test("rejects paid or stale evidence even when the provider is reachable", async () => {
  const paid = await probeZeroCreditProvider(config, responseFetch(proof({ metered: true, billingState: "metered" })), () => NOW);
  assert.equal(providerStateFromProbe(paid, NOW).zeroCreditEligible, false);

  const stale = await probeZeroCreditProvider(config, responseFetch(proof({ verifiedAt: NOW - 120_000, canaryExpiresAt: NOW - 1 })), () => NOW);
  const staleState = providerStateFromProbe(stale, NOW);
  assert.equal(staleState.zeroCreditEligible, false);
  assert.equal(staleState.reasonCode, "provider-canary-stale");
});

test("maps Free-tier exhaustion to provider.gap instead of a fallback", async () => {
  const probe = await probeZeroCreditProvider(config, responseFetch({}, 429), () => NOW);
  const state = providerStateFromProbe(probe, NOW);
  assert.equal(state.available, false);
  assert.equal(state.zeroCreditEligible, false);
  assert.equal(state.reasonCode, "provider-free-quota-exhausted");
});
