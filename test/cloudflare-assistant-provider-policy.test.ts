import assert from "node:assert/strict";
import test from "node:test";

import {
  projectAssistantRespondCapability,
  selectZeroCreditProvider,
  type ProviderProbe,
} from "../deploy/cloudflare-execution-runtime/provider-policy.ts";

const NOW = Date.parse("2026-09-22T06:00:00Z");

const healthyZeroProbe = (overrides: Partial<ProviderProbe> = {}): ProviderProbe => ({
  providerId: "cloudflare-test-zero",
  modelId: "test-model",
  available: true,
  costClass: "cloud-open-weight",
  metered: false,
  priceUsd: 0,
  spendUsd: 0,
  billingState: "verified-zero",
  zeroDollarStopGuaranteed: true,
  observedAt: NOW - 1_000,
  verifiedAt: NOW - 1_000,
  canaryExpiresAt: NOW + 60_000,
  reasonCode: null,
  ...overrides,
});

test("assistant.respond stays fail-closed when no provider evidence exists", () => {
  assert.deepEqual(projectAssistantRespondCapability(null, NOW), {
    capability: "assistant.respond",
    routable: false,
    enabled: false,
    provider: "cloudflare-native",
    workerIds: [],
    routingReason: "provider.gap",
    providerReasonCode: "cloudflare-native-provider-pending",
    evidenceLevel: "runtime-probe",
  });
});

test("stale provider canary keeps assistant.respond unroutable", () => {
  const projection = projectAssistantRespondCapability(
    healthyZeroProbe({ canaryExpiresAt: NOW - 1 }),
    NOW,
  );

  assert.equal(projection.routable, false);
  assert.equal(projection.enabled, false);
  assert.equal(projection.providerReasonCode, "provider-canary-stale");
});

test("zero-credit provider without hard-zero evidence is rejected", () => {
  const projection = projectAssistantRespondCapability(
    healthyZeroProbe({ billingState: "unknown", zeroDollarStopGuaranteed: false }),
    NOW,
  );

  assert.equal(projection.routable, false);
  assert.equal(projection.providerReasonCode, "provider-zero-credit-unverified");
});

test("verified-zero provider becomes routable only while fresh and available", () => {
  const projection = projectAssistantRespondCapability(healthyZeroProbe(), NOW);

  assert.equal(projection.routable, true);
  assert.equal(projection.enabled, true);
  assert.equal(projection.provider, "cloudflare-test-zero");
  assert.equal(projection.providerReasonCode, null);
  assert.equal(projection.routingReason, null);
});

test("zero-credit selection never falls through to licensed or metered providers", () => {
  const probes: ProviderProbe[] = [
    healthyZeroProbe({
      providerId: "zero-exhausted",
      available: false,
      reasonCode: "provider-quota-exhausted",
    }),
    healthyZeroProbe({
      providerId: "licensed-ready",
      costClass: "licensed-cloud",
      metered: false,
      billingState: "licensed",
      zeroDollarStopGuaranteed: false,
    }),
    healthyZeroProbe({
      providerId: "metered-ready",
      costClass: "metered-cloud",
      metered: true,
      priceUsd: 0.01,
      spendUsd: 0,
      billingState: "metered",
      zeroDollarStopGuaranteed: false,
    }),
  ];

  assert.equal(selectZeroCreditProvider(probes, NOW), null);
});
