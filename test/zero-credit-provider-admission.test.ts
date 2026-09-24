import assert from "node:assert/strict";
import test from "node:test";

import { probeZeroCreditProvider, providerStateForGap, providerStateFromProbe } from "../deploy/cloudflare-execution-runtime/provider-admission.ts";
import { ASSISTANT_MODEL_ID, ASSISTANT_PROVIDER_ID, FREE_ALLOCATION_NEURONS, MAHORAGA_DAILY_BUDGET_NEURONS, type ZeroCreditProviderConfig } from "../deploy/cloudflare-execution-runtime/provider-invoker.ts";

const NOW = 1_790_208_000_000;
const config: ZeroCreditProviderConfig = {
  origin: "https://zero-credit.example/",
  token: "z".repeat(64),
  accountIdHash: "a".repeat(64),
  targetSha: "b".repeat(40),
};
const billingAttestation = JSON.stringify({
  schemaVersion: 1,
  evidenceSource: "cloudflare-account-api",
  accountIdHash: "a".repeat(64),
  defaultUsageModel: "standard",
  billableAccountSubscriptionCount: 0,
  verifiedAt: NOW,
  expiresAt: NOW + 90 * 60_000,
});

const proof = (overrides: Record<string, unknown> = {}) => ({
  providerId: ASSISTANT_PROVIDER_ID,
  modelId: ASSISTANT_MODEL_ID,
  targetSha: config.targetSha,
  accountIdHash: config.accountIdHash,
  billingBoundary: "daily-free-allocation-budget",
  freeAllocationNeurons: FREE_ALLOCATION_NEURONS,
  dailyBudgetNeurons: MAHORAGA_DAILY_BUDGET_NEURONS,
  available: true,
  observedAt: NOW,
  verifiedAt: NOW,
  canaryExpiresAt: NOW + 75 * 60_000,
  ...overrides,
});

const responseFetch = (body: Record<string, unknown>, status = 200): typeof fetch =>
  async () => Response.json(body, { status });

test("admits fresh identity-bound proof when billing attestation independently proves zero billable subscriptions", async () => {
  const probe = await probeZeroCreditProvider(config, billingAttestation, responseFetch(proof()), () => NOW);
  const state = providerStateFromProbe(probe, NOW);
  assert.equal(state.available, true);
  assert.equal(state.zeroCreditEligible, true);
  assert.equal(state.reasonCode, null);
  assert.equal(state.canaryExpiresAt, NOW + 75 * 60_000);
});

test("rejects wrong identity or a budget boundary that could exceed the free allocation", async () => {
  const wrongIdentity = await probeZeroCreditProvider(config, billingAttestation, responseFetch(proof({ accountIdHash: "c".repeat(64) })), () => NOW);
  assert.equal(providerStateFromProbe(wrongIdentity, NOW).reasonCode, "provider-identity-mismatch");

  const unsafeBudget = await probeZeroCreditProvider(config, billingAttestation, responseFetch(proof({ dailyBudgetNeurons: FREE_ALLOCATION_NEURONS })), () => NOW);
  const unsafeState = providerStateFromProbe(unsafeBudget, NOW);
  assert.equal(unsafeState.zeroCreditEligible, false);
  assert.equal(unsafeState.reasonCode, "provider-identity-mismatch");
});

test("rejects stale provider evidence even when the provider is reachable", async () => {
  const stale = await probeZeroCreditProvider(config, billingAttestation, responseFetch(proof({ verifiedAt: NOW - 120_000, canaryExpiresAt: NOW - 1 })), () => NOW);
  const staleState = providerStateFromProbe(stale, NOW);
  assert.equal(staleState.zeroCreditEligible, false);
  assert.equal(staleState.reasonCode, "provider-canary-stale");
});

test("rejects missing, stale, or billable-account attestations independently of provider claims", async () => {
  const providerSelfClaimsZero = proof({
    metered: false,
    priceUsd: 0,
    spendUsd: 0,
    billingState: "verified-zero",
    zeroDollarStopGuaranteed: true,
  });
  for (const candidateBillingAttestation of [
    "",
    JSON.stringify({
      schemaVersion: 1,
      evidenceSource: "cloudflare-account-api",
      accountIdHash: config.accountIdHash,
      defaultUsageModel: "standard",
      billableAccountSubscriptionCount: 1,
      verifiedAt: NOW,
      expiresAt: NOW + 90 * 60_000,
    }),
    JSON.stringify({
      schemaVersion: 1,
      evidenceSource: "cloudflare-account-api",
      accountIdHash: config.accountIdHash,
      defaultUsageModel: "standard",
      billableAccountSubscriptionCount: 0,
      verifiedAt: NOW - 91 * 60_000,
      expiresAt: NOW - 60_000,
    }),
  ]) {
    const probe = await probeZeroCreditProvider(config, candidateBillingAttestation, responseFetch(providerSelfClaimsZero), () => NOW);
    const state = providerStateFromProbe(probe, NOW);
    assert.equal(state.zeroCreditEligible, false);
    assert.equal(state.reasonCode, "provider-billing-attestation-invalid");
  }
});

test("maps free-allocation budget exhaustion to provider.gap instead of a fallback", async () => {
  const probe = await probeZeroCreditProvider(config, billingAttestation, responseFetch({}, 429), () => NOW);
  const state = providerStateFromProbe(probe, NOW);
  assert.equal(state.available, false);
  assert.equal(state.zeroCreditEligible, false);
  assert.equal(state.reasonCode, "provider-free-quota-exhausted");
});

test("revokes persisted eligibility when runtime invocation exhausts the free quota", () => {
  const state = providerStateForGap("provider-free-quota-exhausted", NOW);
  assert.deepEqual(state, {
    providerId: ASSISTANT_PROVIDER_ID,
    available: false,
    zeroCreditEligible: false,
    reasonCode: "provider-free-quota-exhausted",
    observedAt: NOW,
    verifiedAt: null,
    canaryExpiresAt: null,
  });
});
