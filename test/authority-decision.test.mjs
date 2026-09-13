import test from "node:test";
import assert from "node:assert/strict";

const NOW = Date.parse("2026-09-12T20:00:00.000Z");

function baseInput(overrides = {}) {
  return {
    ownerGrant: { grantId: "owner-root", state: "active" },
    task: { capability: "system.health", dataClass: "synthetic", affectedPaths: [] },
    candidate: {
      workerId: "local-core",
      costClass: "deterministic",
      billingClass: "deterministic-zero",
      requiresAttendedDesktop: false,
    },
    ownerDecision: null,
    providerDecision: null,
    creditFreeDecision: null,
    billingDecision: { required: false, effectiveClass: "deterministic-zero", eligible: true },
    context: { now: NOW, trustEpoch: "epoch-current" },
    legacyReason: null,
    ...overrides,
  };
}

test("projects admitted evidence into one immutable allow envelope", async () => {
  const { createAuthorityDecision } = await import("../src/authority-decision.mjs");
  const decision = createAuthorityDecision(baseInput());
  assert.equal(decision.schemaVersion, 1);
  assert.equal(decision.kind, "authority-decision-v1");
  assert.equal(decision.decision, "allow");
  assert.deepEqual(decision.reasonCodes, []);
  assert.deepEqual(decision.owner, {
    grantId: "owner-root", state: "active", authorized: null,
    confirmationRequired: false, requestedScope: null, requestedTarget: null,
    requiredScopes: [],
  });
  assert.equal(decision.request.capability, "system.health");
  assert.equal(decision.request.mutationClass, null);
  assert.deepEqual(decision.request.affectedResources, []);
  assert.equal(decision.provider.id, "local-core");
  assert.equal(decision.provider.costClass, "deterministic");
  assert.equal(decision.provider.billingClass, "deterministic-zero");
  assert.equal(decision.provider.attendanceRequired, false);
  assert.equal(decision.execution.integrationLeaseId, null);
  assert.equal(decision.execution.trustEpoch, "epoch-current");
  assert.equal(decision.execution.candidateHeadSha, null);
  assert.equal(decision.timing.observedAt, new Date(NOW).toISOString());
  assert.equal(decision.timing.expiresAt, null);
  assert.equal(decision.timing.revokedAt, null);
  assert.equal(Object.isFrozen(decision), true);
  assert.equal(Object.isFrozen(decision.evidence), true);
});

test("explicit owner denial projects deny with deterministic reason", async () => {
  const { createAuthorityDecision } = await import("../src/authority-decision.mjs");
  const ownerDecision = {
    authorized: false,
    reason: "owner-scope-revoked",
    requestedScope: "copilot.invoke",
    requestedTarget: null,
    requiredScopes: ["copilot.invoke"],
    confirmationRequired: false,
  };
  const decision = createAuthorityDecision(baseInput({ ownerDecision }));
  assert.equal(decision.decision, "deny");
  assert.deepEqual(decision.reasonCodes, ["owner-scope-revoked"]);
  assert.equal(decision.owner.authorized, false);
  assert.deepEqual(decision.evidence.ownerAuthority, ownerDecision);
});

test("temporary confirmation provider and quota gates project hold", async () => {
  const { createAuthorityDecision } = await import("../src/authority-decision.mjs");
  const cases = [
    {
      input: { ownerDecision: { authorized: true, reason: null, requestedScope: "copilot.invoke", requestedTarget: null, requiredScopes: ["copilot.invoke"], confirmationRequired: true } },
      reason: "owner-confirmation-required",
    },
    {
      input: { providerDecision: { status: "waiting", providerId: "openai-primary" } },
      reason: "provider-unavailable",
    },
    {
      input: {
        billingDecision: {
          required: true,
          effectiveClass: "metered",
          eligible: false,
        },
      },
      reason: "billing-not-zero-credit",
    },
  ];
  for (const item of cases) {
    const decision = createAuthorityDecision(baseInput(item.input));
    assert.equal(decision.decision, "hold");
    assert.equal(decision.reasonCodes[0], item.reason);
  }
});
