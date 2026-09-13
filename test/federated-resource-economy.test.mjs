import test from "node:test";
import assert from "node:assert/strict";
import {
  economicTierForBillingClass,
  isZeroMarginalCreditEligible,
  validateBillingClass,
} from "../src/resource-economy.mjs";
import { loadManifest } from "../src/config.mjs";
import { routeTask } from "../src/router.mjs";

const NOW = Date.parse("2026-09-12T03:45:00.000Z");

function verifiedState(manifest, workerId) {
  const worker = manifest.workers.find((item) => item.id === workerId);
  return {
    workerId,
    status: "live",
    lastHeartbeatAt: "2026-09-12T03:44:59.000Z",
    readiness: worker.capabilities.map((capability) => ({
      workerId,
      capability,
      processStatus: "live",
      providerStatus: "ready",
      canaryStatus: "verified",
      processObservedAt: "2026-09-12T03:44:59.000Z",
      providerObservedAt: "2026-09-12T03:44:58.000Z",
      canaryVerifiedAt: "2026-09-12T03:44:57.000Z",
      lastErrorCode: null,
    })),
  };
}

test("resource economy distinguishes evidence-bound free-tier and subscription-included routes from metered routes", () => {
  assert.equal(validateBillingClass("deterministic-zero"), "deterministic-zero");
  assert.equal(validateBillingClass("free-tier-zero"), "free-tier-zero");
  assert.equal(validateBillingClass("license-included"), "license-included");
  assert.equal(isZeroMarginalCreditEligible("deterministic-zero"), true);
  assert.equal(isZeroMarginalCreditEligible("free-tier-zero"), false);
  assert.equal(isZeroMarginalCreditEligible("free-tier-zero", {
    status: "available",
    observedAt: "2026-09-12T03:44:30.000Z",
    expiresAt: "2026-09-12T03:50:00.000Z",
  }, NOW), true);
  assert.equal(isZeroMarginalCreditEligible("license-included"), true);
  assert.equal(isZeroMarginalCreditEligible("metered-copilot-credit"), false);
  assert.equal(isZeroMarginalCreditEligible("metered"), false);
  assert.equal(isZeroMarginalCreditEligible("unknown"), false);
  assert.ok(economicTierForBillingClass("deterministic-zero") < economicTierForBillingClass("free-tier-zero"));
  assert.ok(economicTierForBillingClass("free-tier-zero") < economicTierForBillingClass("license-included"));
  assert.ok(economicTierForBillingClass("license-included") < economicTierForBillingClass("metered-copilot-credit"));
  assert.ok(economicTierForBillingClass("metered-copilot-credit") < economicTierForBillingClass("metered"));
});

test("Google attended Workspace route is zero-marginal only when its capability billing evidence is explicit", async () => {
  const manifest = await loadManifest();
  const google = manifest.workers.find((item) => item.id === "google-workspace");
  assert.deepEqual(google.billingClassByCapability, {
    "google.health": "deterministic-zero",
    "google.open": "license-included",
  });

  const route = routeTask(manifest, {
    capability: "google.open",
    dataClass: "enterprise",
    requestedMode: "hybrid",
  }, {
    workerStates: [verifiedState(manifest, "google-workspace")],
    now: NOW,
    providerPolicy: "zero-credit",
  });

  assert.equal(route.status, "routable");
  assert.equal(route.worker.id, "google-workspace");
  assert.equal(route.billingDecision.effectiveClass, "license-included");
  assert.equal(route.billingDecision.eligible, true);
});
