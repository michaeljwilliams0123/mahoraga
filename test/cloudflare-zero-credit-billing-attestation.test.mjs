import assert from "node:assert/strict";
import test from "node:test";

import { buildZeroCreditBillingAttestation, fetchZeroCreditBillingEvidence } from "../scripts/cloudflare-zero-credit-attestation.mjs";

const NOW = 1_790_208_000_000;
const ACCOUNT_HASH = "a".repeat(64);
const settings = (defaultUsageModel = "bundled") => ({
  success: true,
  result: { default_usage_model: defaultUsageModel },
});
const subscriptions = (result = []) => ({ success: true, result });

test("creates a short-lived attestation only from independent Free-account evidence", () => {
  assert.deepEqual(buildZeroCreditBillingAttestation({
    accountIdHash: ACCOUNT_HASH,
    accountSettingsEnvelope: settings(),
    subscriptionsEnvelope: subscriptions(),
    now: NOW,
  }), {
    schemaVersion: 1,
    evidenceSource: "cloudflare-account-api",
    accountIdHash: ACCOUNT_HASH,
    defaultUsageModel: "bundled",
    billableAccountSubscriptionCount: 0,
    verifiedAt: NOW,
    expiresAt: NOW + 90 * 60_000,
  });
});

test("treats Workers usage model as metadata when billing evidence proves no billable subscription", () => {
  assert.deepEqual(buildZeroCreditBillingAttestation({
    accountIdHash: ACCOUNT_HASH,
    accountSettingsEnvelope: settings("standard"),
    subscriptionsEnvelope: subscriptions(),
    now: NOW,
  }), {
    schemaVersion: 1,
    evidenceSource: "cloudflare-account-api",
    accountIdHash: ACCOUNT_HASH,
    defaultUsageModel: "standard",
    billableAccountSubscriptionCount: 0,
    verifiedAt: NOW,
    expiresAt: NOW + 90 * 60_000,
  });
});

test("rejects paid, trial, external, and unknown account subscriptions", () => {
  for (const entry of [
    { state: "Paid", price: 5, rate_plan: { id: "workers" } },
    { state: "Trial", price: 0, rate_plan: { id: "workers" } },
    { state: "Provisioned", price: 0, rate_plan: { id: "free", externally_managed: true } },
    { state: "Unexpected", price: 0, rate_plan: { id: "free" } },
  ]) {
    assert.throws(() => buildZeroCreditBillingAttestation({
      accountIdHash: ACCOUNT_HASH,
      accountSettingsEnvelope: settings(),
      subscriptionsEnvelope: subscriptions([entry]),
      now: NOW,
    }), /account-subscription-not-provably-free/);
  }
});

test("permits explicit zero-dollar Free subscriptions and ignores terminated ones", () => {
  const attestation = buildZeroCreditBillingAttestation({
    accountIdHash: ACCOUNT_HASH,
    accountSettingsEnvelope: settings("standard"),
    subscriptionsEnvelope: subscriptions([
      { state: "Provisioned", price: 0, rate_plan: { id: "free", externally_managed: false, is_contract: false } },
      { state: "Cancelled", price: 5, rate_plan: { id: "workers" } },
      { state: "Expired", price: 5, rate_plan: { id: "workers" } },
    ]),
    now: NOW,
  });
  assert.equal(attestation.defaultUsageModel, "standard");
  assert.equal(attestation.billableAccountSubscriptionCount, 0);
});

test("uses a separate read-only billing token only for the subscriptions proof", async () => {
  const calls = [];
  const result = await fetchZeroCreditBillingEvidence({
    accountId: "a".repeat(32), deploymentToken: "deploy", billingReadToken: "billing",
    fetchImpl: async (url, options) => {
      calls.push({ url, authorization: options.headers.authorization });
      return { ok: true, json: async () => url.endsWith("/subscriptions") ? subscriptions() : settings("standard") };
    },
  });
  assert.equal(result.accountSettingsEnvelope.success, true);
  assert.equal(result.subscriptionsEnvelope.success, true);
  assert.deepEqual(calls.map(({ authorization }) => authorization), ["Bearer deploy", "Bearer billing"]);
});

test("billing authorization failure is actionable and never treated as free evidence", async () => {
  await assert.rejects(fetchZeroCreditBillingEvidence({
    accountId: "a".repeat(32), deploymentToken: "deploy", billingReadToken: "billing",
    fetchImpl: async (url) => url.endsWith("/subscriptions")
      ? { ok: false, status: 403 }
      : { ok: true, json: async () => settings("standard") },
  }), /cloudflare-subscriptions-billing-read-required-403/);
});
