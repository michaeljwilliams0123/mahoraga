import test from "node:test";
import assert from "node:assert/strict";
import { executePowerPlatformCapability } from "../src/power-platform-worker.mjs";
import { executeCopilotStudioCapability } from "../src/copilot-studio-worker.mjs";

const worker = Object.freeze({ billingClassByCapability: Object.freeze({
  "studio.health": "deterministic-zero", "studio.delegate": "unknown",
}) });

test("Power Platform worker health and discovery stay deterministic and sanitized", async () => {
  const probe = async () => ({ verified: true, summary: "ready", providerHealth: { logicalAliases: ["general-mahoraga"], usageBillingClass: "deterministic-zero" } });
  const discover = async () => [{ alias: "general-mahoraga", published: true, active: true, provisioned: true }];
  const health = await executePowerPlatformCapability("powerplatform.health", {}, {}, { probePowerPlatformProvider: probe });
  const found = await executePowerPlatformCapability("powerplatform.discover", {}, {}, { discoverPowerPlatformAgents: discover });
  assert.equal(health.verified, true);
  assert.deepEqual(found.providerHealth.logicalAliases, ["general-mahoraga"]);
  assert.equal(found.providerHealth.usageBillingClass, "deterministic-zero");
});

test("Studio health proves provider binding without invoking a model", async () => {
  let invoked = false;
  const result = await executeCopilotStudioCapability("studio.health", {}, worker, {
    env: { MAHORAGA_COPILOT_STUDIO_DELEGATE_BILLING_CLASS: "license-included" },
    probePowerPlatformProvider: async () => ({ verified: true, providerHealth: { authenticated: true } }),
    loadRuntimeSettings: () => ({ connectionSettings: {}, tenantId: "t", appClientId: "c" }),
    invokeAgent: async () => { invoked = true; },
  });
  assert.equal(result.verified, true);
  assert.equal(invoked, false);
  assert.deepEqual(result.providerHealth.platformAuthorityScopes, ["connector.invoke", "copilot.invoke"]);
  assert.equal(result.providerHealth.usageBillingClass, "deterministic-zero");
  assert.equal(result.providerHealth.delegateBillingClass, "license-included");
});

test("Studio delegate refuses billing-unknown execution before model invocation", async () => {
  let invoked = false;
  await assert.rejects(() => executeCopilotStudioCapability("studio.delegate", {
    requestedOutcome: "Validate this architecture", idempotencyKey: "k1",
  }, worker, {
    env: {}, loadRuntimeSettings: () => ({ connectionSettings: {}, tenantId: "t", appClientId: "c" }),
    invokeAgent: async () => { invoked = true; return {}; },
  }), /billing-not-zero-credit/);
  assert.equal(invoked, false);
});

test("Studio delegate invokes only when runtime billing is license-included", async () => {
  const calls = [];
  const result = await executeCopilotStudioCapability("studio.delegate", {
    requestedOutcome: "Validate this architecture", idempotencyKey: "k2",
  }, worker, {
    env: { MAHORAGA_COPILOT_STUDIO_DELEGATE_BILLING_CLASS: "license-included" },
    loadRuntimeSettings: () => ({ connectionSettings: {}, tenantId: "t", appClientId: "c" }),
    createTokenProvider: () => ({ getToken: async () => "tok" }),
    invokeAgent: async (input) => { calls.push(input); return { verified: true, responseText: "ACK", providerReceipt: { role: input.role } }; },
  });
  assert.equal(result.verified, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { role: "reasoner", prompt: "Validate this architecture", idempotencyKey: "k2" });
});