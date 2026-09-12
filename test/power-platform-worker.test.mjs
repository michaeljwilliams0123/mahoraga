import test from "node:test";
import assert from "node:assert/strict";
import { createCopilotHarnessDescriptor } from "../src/copilot-harness-descriptor.mjs";
import { executePowerPlatformCapability } from "../src/power-platform-worker.mjs";
import { executeCopilotStudioCapability } from "../src/copilot-studio-worker.mjs";

const worker = Object.freeze({ billingClassByCapability: Object.freeze({
  "studio.health": "deterministic-zero", "studio.delegate": "unknown", "studio.configure": "unknown",
}) });

function harnessDescriptor() {
  return createCopilotHarnessDescriptor({
    alias: "enterprise-core", harnessType: "github-copilot-harness", published: true, connectable: true,
    capabilityClasses: ["analysis"], instructionsSummary: "Bounded enterprise reasoning specialist.",
    knowledgeCategories: ["m365-enterprise"], toolKinds: ["mcp"], skillNames: ["document-analysis"], connectedAgentAliases: [],
    modelClass: "reasoning-high", modelStatus: "production", memoryEnabled: true,
    evaluation: { state: "passing", score: 0.9, observedAt: "2026-09-11T03:00:00.000Z" },
    monitoring: { successRate: 0.98, latencyMs: 1200, observedAt: "2026-09-11T03:05:00.000Z" },
    authorityScopes: ["connector.invoke", "copilot.invoke"], dataClasses: ["enterprise"], observedAt: "2026-09-11T03:10:00.000Z",
  });
}

test("Power Platform worker health and discovery stay deterministic and sanitized", async () => {
  const probe = async () => ({ verified: true, summary: "ready", providerHealth: { logicalAliases: ["general-mahoraga"], usageBillingClass: "deterministic-zero" } });
  const descriptor = harnessDescriptor();
  const discover = async () => [{ alias: "enterprise-core", published: true, active: true, provisioned: true, harnessDescriptor: descriptor }];
  const health = await executePowerPlatformCapability("powerplatform.health", {}, {}, { probePowerPlatformProvider: probe });
  const found = await executePowerPlatformCapability("powerplatform.discover", {}, {}, { discoverPowerPlatformAgents: discover });
  assert.equal(health.verified, true);
  assert.deepEqual(found.providerHealth.logicalAliases, ["enterprise-core"]);
  assert.equal(found.providerHealth.usageBillingClass, "deterministic-zero");
  assert.deepEqual(found.harnessDescriptors, [descriptor]);
  assert.deepEqual(found.harnessTopology.nodes, [{
    alias: "enterprise-core", harnessType: "github-copilot-harness", published: true, connectable: true,
    billingClass: "metered-copilot-credit", zeroCreditEligible: false,
  }]);
  assert.deepEqual(found.harnessTopology.edges, []);
});

test("Studio health separates management-plane and delegation-runtime readiness without invoking a model", async () => {
  let invoked = false;
  const result = await executeCopilotStudioCapability("studio.health", {}, worker, {
    env: { MAHORAGA_COPILOT_STUDIO_DELEGATE_BILLING_CLASS: "license-included" },
    probePowerPlatformProvider: async () => ({ verified: true, providerHealth: { authenticated: true } }),
    loadRuntimeSettings: () => ({ connectionSettings: {}, tenantId: "t", appClientId: "c" }),
    invokeAgent: async () => { invoked = true; },
  });
  assert.equal(result.verified, true);
  assert.equal(invoked, false);
  assert.equal(result.providerHealth.managementPlaneReady, true);
  assert.equal(result.providerHealth.delegationRuntimeReady, true);
  assert.deepEqual(result.providerHealth.platformAuthorityScopes, ["connector.invoke", "copilot.invoke"]);
  assert.equal(result.providerHealth.usageBillingClass, "deterministic-zero");
  assert.equal(result.providerHealth.delegateBillingClass, "license-included");
});

test("Studio health preserves healthy management plane when delegation runtime binding is unavailable", async () => {
  const result = await executeCopilotStudioCapability("studio.health", {}, worker, {
    env: {},
    probePowerPlatformProvider: async () => ({ verified: true, providerHealth: { authenticated: true } }),
    loadRuntimeSettings: () => { throw new Error("copilot-studio-runtime-binding-missing"); },
  });
  assert.equal(result.verified, false);
  assert.equal(result.providerHealth.managementPlaneReady, true);
  assert.equal(result.providerHealth.delegationRuntimeReady, false);
  assert.equal(result.providerHealth.authenticated, true);
  assert.deepEqual(result.providerHealth.platformAuthorityScopes, []);
  assert.match(result.summary, /management plane is ready/i);
  assert.match(result.summary, /delegation runtime binding is unavailable/i);
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

test("Studio configure applies only a sanitized known-agent improvement candidate", async () => {
  const calls = [];
  const result = await executeCopilotStudioCapability("studio.configure", {
    idempotencyKey: "cfg-1",
    requestedOutcome: JSON.stringify({
      alias: "enterprise-core",
      reasonCodes: ["connected-agent-missing", "tool-missing"],
      surfaces: ["connected-agents", "tools"],
      publish: false,
    }),
  }, worker, {
    env: { MAHORAGA_COPILOT_STUDIO_CONFIGURE_BILLING_CLASS: "license-included" },
    configureAgent: async (request) => { calls.push(request); return { verified: true, phases: ["pull", "validate", "push"] }; },
  });
  assert.equal(result.verified, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    alias: "enterprise-core",
    reasonCodes: ["connected-agent-missing", "tool-missing"],
    surfaces: ["connected-agents", "tools"],
    publish: false,
    idempotencyKey: "cfg-1",
  });
  assert.deepEqual(result.providerReceipt, {
    alias: "enterprise-core", reasonCodes: ["connected-agent-missing", "tool-missing"], surfaces: ["connected-agents", "tools"],
    phases: ["pull", "validate", "push"], published: false,
  });
});

test("Studio configure fails closed for unknown billing, agents, or configuration surfaces", async () => {
  let configured = false;
  const base = { idempotencyKey: "cfg-2" };
  await assert.rejects(() => executeCopilotStudioCapability("studio.configure", {
    ...base, requestedOutcome: JSON.stringify({ alias: "enterprise-core", reasonCodes: ["tool-missing"], surfaces: ["tools"], publish: false }),
  }, worker, { env: {}, configureAgent: async () => { configured = true; } }), /billing-not-zero-credit/);
  await assert.rejects(() => executeCopilotStudioCapability("studio.configure", {
    ...base, requestedOutcome: JSON.stringify({ alias: "arbitrary-agent", reasonCodes: ["tool-missing"], surfaces: ["tools"], publish: false }),
  }, worker, { env: { MAHORAGA_COPILOT_STUDIO_CONFIGURE_BILLING_CLASS: "license-included" }, configureAgent: async () => { configured = true; } }), /studio-configure-request-invalid/);
  await assert.rejects(() => executeCopilotStudioCapability("studio.configure", {
    ...base, requestedOutcome: JSON.stringify({ alias: "enterprise-core", reasonCodes: ["tool-missing"], surfaces: ["credentials"], publish: false }),
  }, worker, { env: { MAHORAGA_COPILOT_STUDIO_CONFIGURE_BILLING_CLASS: "license-included" }, configureAgent: async () => { configured = true; } }), /studio-configure-request-invalid/);
  assert.equal(configured, false);
});
