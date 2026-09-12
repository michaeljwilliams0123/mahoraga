import test from "node:test";
import assert from "node:assert/strict";
import { createCopilotHarnessDescriptor } from "../src/copilot-harness-descriptor.mjs";
import { compileCopilotStudioImprovementCandidates } from "../src/copilot-studio-improvement-candidate.mjs";

const NOW = "2026-09-12T06:00:00.000Z";

function descriptor(patch = {}) {
  return createCopilotHarnessDescriptor({
    alias: "general-mahoraga",
    harnessType: "github-copilot-harness",
    published: true,
    connectable: true,
    capabilityClasses: ["orchestration"],
    instructionsSummary: "Owner-directed orchestration with bounded specialist delegation.",
    knowledgeCategories: ["m365-enterprise"],
    toolKinds: ["connector"],
    skillNames: ["task-routing"],
    connectedAgentAliases: ["enterprise-core"],
    modelClass: "reasoning-high",
    modelStatus: "production",
    memoryEnabled: true,
    evaluation: { state: "passing", score: 0.94, observedAt: "2026-09-12T05:30:00.000Z" },
    monitoring: { successRate: 0.97, latencyMs: 1200, observedAt: "2026-09-12T05:35:00.000Z" },
    authorityScopes: ["connector.invoke", "copilot.invoke"],
    dataClasses: ["enterprise"],
    observedAt: "2026-09-12T05:40:00.000Z",
    ...patch,
  });
}

const POLICY = Object.freeze({
  alias: "general-mahoraga",
  requiredCapabilityClasses: ["orchestration", "analysis"],
  requiredKnowledgeCategories: ["m365-enterprise", "sharepoint"],
  requiredToolKinds: ["connector", "mcp"],
  requiredSkillNames: ["task-routing", "verification"],
  requiredConnectedAgentAliases: ["enterprise-core", "tenant-health-reader"],
  requireProductionModel: true,
  requireMemory: true,
  minimumEvaluationScore: 0.9,
  minimumMonitoringSuccessRate: 0.9,
  maximumEvidenceAgeMs: 24 * 60 * 60 * 1000,
});

test("compiler emits bounded deterministic configuration findings from sanitized harness evidence", () => {
  const weak = descriptor({
    capabilityClasses: ["orchestration"],
    knowledgeCategories: ["m365-enterprise"],
    toolKinds: ["connector"],
    skillNames: ["task-routing"],
    connectedAgentAliases: ["enterprise-core"],
    modelStatus: "preview",
    memoryEnabled: false,
    evaluation: { state: "failing", score: 0.61, observedAt: "2026-09-10T05:30:00.000Z" },
    monitoring: { successRate: 0.72, latencyMs: 2400, observedAt: "2026-09-10T05:35:00.000Z" },
  });
  const result = compileCopilotStudioImprovementCandidates([weak], [POLICY], { now: NOW });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.candidates.length, 1);
  const candidate = result.candidates[0];
  assert.equal(candidate.alias, "general-mahoraga");
  assert.deepEqual(candidate.reasonCodes, [
    "capability-missing", "connected-agent-missing", "evaluation-failing", "evaluation-stale",
    "knowledge-missing", "memory-required", "model-not-production", "monitoring-below-threshold",
    "monitoring-stale", "skill-missing", "tool-missing",
  ]);
  assert.deepEqual(candidate.surfaces, ["connected-agents", "evaluate", "instructions", "knowledge", "memory", "model", "monitor", "skills", "tools"]);
  assert.equal(candidate.severity, "blocking");
  assert.match(candidate.descriptorId, /^chd-[a-f0-9]{32}$/);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("Owner-directed orchestration"), false);
  assert.equal(serialized.includes("22839bcc"), false);
  assert.equal(serialized.includes("@"), false);
  assert.equal(serialized.includes("http"), false);
});

test("compiler returns no candidate when the agent satisfies its declared policy", () => {
  const healthy = descriptor({
    capabilityClasses: ["analysis", "orchestration"],
    knowledgeCategories: ["m365-enterprise", "sharepoint"],
    toolKinds: ["connector", "mcp"],
    skillNames: ["task-routing", "verification"],
    connectedAgentAliases: ["enterprise-core", "tenant-health-reader"],
  });
  const result = compileCopilotStudioImprovementCandidates([healthy], [POLICY], { now: NOW });
  assert.deepEqual(result.candidates, []);
});

test("compiler rejects policy aliases without matching validated descriptors", () => {
  assert.throws(
    () => compileCopilotStudioImprovementCandidates([descriptor()], [{ ...POLICY, alias: "missing-agent" }], { now: NOW }),
    /copilot-studio-improvement-policy-unmatched/,
  );
});
