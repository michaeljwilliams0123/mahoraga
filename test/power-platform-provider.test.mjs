import test from "node:test";
import assert from "node:assert/strict";
import { discoverPowerPlatformAgents, probePowerPlatformProvider } from "../src/power-platform-provider.mjs";

const fixture = `Connected as owner@example.com
Connected to... Secret Environment
Name                          Copilot ID                           Component State Is Managed Solution ID                          Status Code State Code
General Mahoraga              22839bcc-f587-f111-ab10-6045bd029e2e Published       False      fd140aae-4df4-11dd-bd17-0019b9312238 Active      Provisioned
Website Q&A                   bdefb9eb-446d-f111-ab0d-6045bd029290 Published       False      fd140aae-4df4-11dd-bd17-0019b9312238 Active      Provisioned
Mahorago Enterprise Core      501917a0-9e8e-f111-8076-000d3a30cfe7 Published       False      fd140aae-4df4-11dd-bd17-0019b9312238 Active      Provisioned
Mahorago Tenant Health Reader 3fed8376-1c8e-f111-8076-000d3a30cfe7 Published       False      fd140aae-4df4-11dd-bd17-0019b9312238 Active      Provisioned`;

const enterpriseHarnessMetadata = Object.freeze({
  harnessType: "github-copilot-harness",
  capabilityClasses: ["analysis", "workflow-design"],
  instructionsSummary: "Bounded enterprise reasoning and workflow specialist.",
  knowledgeCategories: ["m365-enterprise", "sharepoint"],
  toolKinds: ["connector", "mcp"],
  skillNames: ["document-analysis"],
  connectedAgentAliases: ["tenant-health-reader"],
  modelClass: "reasoning-high",
  modelStatus: "production",
  memoryEnabled: true,
  evaluation: { state: "passing", score: 0.92, observedAt: "2026-09-11T03:00:00.000Z" },
  monitoring: { successRate: 0.98, latencyMs: 1200, observedAt: "2026-09-11T03:05:00.000Z" },
  authorityScopes: ["connector.invoke", "copilot.invoke"],
  dataClasses: ["enterprise"],
  observedAt: "2026-09-11T03:10:00.000Z",
});

test("Power Platform discovery returns only allowlisted logical aliases and bounded states", async () => {
  const agents = await discoverPowerPlatformAgents({ runPac: async () => ({ stdout: fixture }) });
  assert.deepEqual(agents.map((item) => item.alias), ["general-mahoraga", "enterprise-core", "tenant-health-reader"]);
  assert.equal(agents.every((item) => item.published && item.active && item.provisioned), true);
  const serialized = JSON.stringify(agents);
  for (const forbidden of ["22839bcc", "fd140aae", "Secret Environment", "owner@example.com", "Website Q&A"]) assert.equal(serialized.includes(forbidden), false);
});

test("Power Platform health reports sanitized zero-credit discovery readiness", async () => {
  const result = await probePowerPlatformProvider({
    platform: "win32",
    runPac: async (_exe, args) => args[0] === "auth"
      ? { stdout: "[1]   * UNIVERSAL profile Public OperatingSystem" }
      : { stdout: fixture },
  });
  assert.equal(result.verified, true);
  assert.equal(result.providerHealth.authenticated, true);
  assert.equal(result.providerHealth.publishedAgentCount, 3);
  assert.equal(result.providerHealth.zeroCreditEligible, true);
  assert.equal(result.providerHealth.usageBillingClass, "deterministic-zero");
  assert.deepEqual(result.providerHealth.logicalAliases, ["general-mahoraga", "enterprise-core", "tenant-health-reader"]);
  assert.equal(JSON.stringify(result).includes("owner@example.com"), false);
});

test("Power Platform discovery failure returns bounded unavailable health", async () => {
  const result = await probePowerPlatformProvider({ platform: "win32", runPac: async () => { throw new Error("token=secret"); } });
  assert.equal(result.verified, false);
  assert.equal(result.providerHealth.authenticated, false);
  assert.equal(result.providerHealth.publishedAgentCount, 0);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("authorized harness metadata projects a sanitized GitHub Copilot harness descriptor without executing it", async () => {
  let pacCalls = 0;
  const agents = await discoverPowerPlatformAgents({
    runPac: async () => { pacCalls += 1; return { stdout: fixture }; },
    harnessMetadataByAlias: { "enterprise-core": enterpriseHarnessMetadata },
  });
  assert.equal(pacCalls, 1);
  const enterprise = agents.find((item) => item.alias === "enterprise-core");
  assert.equal(enterprise.harnessDescriptor.harnessType, "github-copilot-harness");
  assert.equal(enterprise.harnessDescriptor.billingClass, "metered-copilot-credit");
  assert.equal(enterprise.harnessDescriptor.zeroCreditEligible, false);
  assert.equal(Object.hasOwn(enterprise.harnessDescriptor, "instructionsSummary"), false);
  const serialized = JSON.stringify(enterprise);
  for (const forbidden of ["501917a0", "owner@example.com", "Secret Environment", "https://", "Bearer "]) assert.equal(serialized.includes(forbidden), false);
});

test("harness identity stays unknown when authorized metadata is absent", async () => {
  const agents = await discoverPowerPlatformAgents({ runPac: async () => ({ stdout: fixture }) });
  for (const agent of agents) {
    assert.equal(agent.harnessDescriptor.harnessType, "unknown");
    assert.equal(agent.harnessDescriptor.billingClass, "unknown");
    assert.equal(agent.harnessDescriptor.zeroCreditEligible, false);
  }
});
