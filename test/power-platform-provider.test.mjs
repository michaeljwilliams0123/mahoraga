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