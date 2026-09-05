import test from "node:test";
import assert from "node:assert/strict";
import { executeSelfExtensionCapability } from "../src/self-extension-worker.mjs";

const worker = {
  id: "primary-codex-builder",
  adapter: {
    kind: "codex-cli-builder",
    directExecutionEnabled: true,
    maximumPromptBytes: 16384,
    sandbox: "workspace-write",
    approvalPolicy: "never",
    networkAccess: false,
    executionTimeoutMs: 300000,
    maximumEventBytes: 524288,
  },
};

function task(overrides = {}) {
  return {
    id: "task-self-extension-1",
    correlationId: "corr-1",
    requestedOutcome: "Improve the bounded implementation.",
    baseCommit: "a".repeat(40),
    allowedPaths: ["src/example.mjs", "test/example.test.mjs"],
    integrationLeaseId: "int-00000000-0000-0000-0000-000000000000",
    integrationLease: { leaseId: "int-00000000-0000-0000-0000-000000000000", paths: ["src/example.mjs", "test/example.test.mjs"], expiresAt: "2099-01-01T00:00:00.000Z" },
    ...overrides,
  };
}

test("code.create-test delegates to the existing Codex Builder with additive preservation", async () => {
  const calls = [];
  const result = await executeSelfExtensionCapability("code.create-test", task(), worker, {
    executeBuilder: async (...args) => { calls.push(args); return { verified: true, summary: "candidate" }; },
  });
  assert.equal(result.verified, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "codex.execute");
  assert.equal(calls[0][1].preserveBaseline, true);
  assert.deepEqual(calls[0][1].allowedPaths, ["src/example.mjs", "test/example.test.mjs"]);
  assert.match(calls[0][1].requestedOutcome, /run relevant tests/i);
  assert.match(calls[0][1].requestedOutcome, /do not delete or rename/i);
});

test("self.patch and self.enhance preserve the caller's bounded execution cell", async () => {
  for (const capability of ["self.patch", "self.enhance"]) {
    let derived;
    await executeSelfExtensionCapability(capability, task(), worker, {
      executeBuilder: async (_capability, nextTask) => { derived = nextTask; return { verified: true, summary: "candidate" }; },
    });
    assert.equal(derived.baseCommit, "a".repeat(40));
    assert.equal(derived.integrationLeaseId, task().integrationLeaseId);
    assert.equal(derived.preserveBaseline, true);
    assert.match(derived.requestedOutcome, /existing architecture/i);
  }
});

test("agent.replicate uses the existing Agent Foundry manifest contract before Codex writes", async () => {
  let derived;
  const manifest = { schemaVersion: 1, agentId: "mahoraga-artifact-builder", parentAgentId: "mahoraga-steward", role: "artifact-builder", mission: "Create bounded artifacts.", capabilities: ["artifact-create"], privileges: ["github-read"], permanent: true, selfUpdate: true, zeroCredit: true, sharedFeatLedger: true, ownerApprovalRequired: false, platformAuthorizationRequired: true, createdAt: "2026-09-05T06:40:00.000Z" };
  await executeSelfExtensionCapability("agent.replicate", task({
    allowedPaths: ["coordination/agent-factory/registry.json"],
    integrationLease: { leaseId: task().integrationLeaseId, paths: ["coordination/agent-factory/registry.json"], expiresAt: "2099-01-01T00:00:00.000Z" },
    agentSpec: { agentId: manifest.agentId, parentAgentId: manifest.parentAgentId, role: manifest.role, mission: manifest.mission, capabilities: manifest.capabilities, privileges: manifest.privileges },
  }), worker, {
    createChildManifest: () => manifest,
    executeBuilder: async (_capability, nextTask) => { derived = nextTask; return { verified: true, summary: "candidate" }; },
  });
  assert.match(derived.requestedOutcome, /agent foundry/i);
  assert.match(derived.requestedOutcome, /mahoraga-artifact-builder/);
  assert.equal(derived.preserveBaseline, true);
});

test("agent.replicate refuses to expand its write scope", async () => {
  await assert.rejects(
    executeSelfExtensionCapability("agent.replicate", task({ agentSpec: { agentId: "mahoraga-x" } }), worker, { executeBuilder: async () => ({ verified: true }) }),
    (error) => error?.code === "agent-registry-path-not-authorized",
  );
});
