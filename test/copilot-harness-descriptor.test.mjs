import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCopilotHarnessTopology,
  createCopilotHarnessDescriptor,
  validateCopilotHarnessDescriptor,
} from "../src/copilot-harness-descriptor.mjs";

const BASE = Object.freeze({
  alias: "enterprise-core",
  harnessType: "github-copilot-harness",
  published: true,
  connectable: true,
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

test("GitHub Copilot harness descriptor is sanitized, immutable, and credit-metered for execution", () => {
  const descriptor = createCopilotHarnessDescriptor(BASE);
  assert.equal(descriptor.alias, "enterprise-core");
  assert.equal(descriptor.harnessType, "github-copilot-harness");
  assert.equal(descriptor.billingClass, "metered-copilot-credit");
  assert.equal(descriptor.zeroCreditEligible, false);
  assert.match(descriptor.instructionsFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(descriptor, "instructionsSummary"), false);
  assert.equal(Object.isFrozen(descriptor), true);
  assert.deepEqual(validateCopilotHarnessDescriptor(descriptor), descriptor);
});

test("descriptor rejects raw provider identity, endpoints, tokens, and private content", () => {
  const badValues = [
    { instructionsSummary: "tenant 22839bcc-f587-f111-ab10-6045bd029e2e" },
    { instructionsSummary: "owner@example.com" },
    { instructionsSummary: "https://org.example.com/private" },
    { instructionsSummary: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz" },
    { skillNames: ["github_pat_11AA22BB33CC44DD55EE66FF77GG88HH99"] },
  ];
  for (const patch of badValues) {
    assert.throws(() => createCopilotHarnessDescriptor({ ...BASE, ...patch }), /copilot-harness-sensitive-content/);
  }
});

test("unknown harness identity remains unknown rather than inferred from alias", () => {
  const descriptor = createCopilotHarnessDescriptor({ ...BASE, harnessType: "unknown", alias: "github-copilot-super-agent" });
  assert.equal(descriptor.harnessType, "unknown");
  assert.equal(descriptor.billingClass, "unknown");
  assert.equal(descriptor.zeroCreditEligible, false);
});

test("connected-agent topology is bounded and preserves only logical aliases", () => {
  const primary = createCopilotHarnessDescriptor(BASE);
  const specialist = createCopilotHarnessDescriptor({
    ...BASE,
    alias: "tenant-health-reader",
    harnessType: "standard-harness",
    connectedAgentAliases: [],
    modelClass: "standard",
    memoryEnabled: false,
  });
  const topology = buildCopilotHarnessTopology([primary, specialist], { maximumConnectedAgents: 4, maximumDepth: 2 });
  assert.deepEqual(topology.nodes.map((item) => item.alias), ["enterprise-core", "tenant-health-reader"]);
  assert.deepEqual(topology.edges, [{ from: "enterprise-core", to: "tenant-health-reader" }]);
  assert.equal(topology.maximumDepth, 2);
  assert.equal(JSON.stringify(topology).includes("22839bcc"), false);
});

test("topology rejects self loops, unknown connected aliases, and excessive fan-out", () => {
  assert.throws(() => buildCopilotHarnessTopology([
    createCopilotHarnessDescriptor({ ...BASE, connectedAgentAliases: ["enterprise-core"] }),
  ]), /copilot-harness-topology-invalid/);
  assert.throws(() => buildCopilotHarnessTopology([
    createCopilotHarnessDescriptor({ ...BASE, connectedAgentAliases: ["missing-agent"] }),
  ]), /copilot-harness-topology-invalid/);
  assert.throws(() => createCopilotHarnessDescriptor({
    ...BASE,
    connectedAgentAliases: Array.from({ length: 9 }, (_, index) => `agent-${index + 1}`),
  }), /copilot-harness-connected-agents-invalid/);
});
