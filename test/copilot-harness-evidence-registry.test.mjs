import test from "node:test";
import assert from "node:assert/strict";
import { buildCapabilityRegistry } from "../src/capability-registry.mjs";
import { createCopilotHarnessDescriptor } from "../src/copilot-harness-descriptor.mjs";
import { loadManifest } from "../src/config.mjs";

const NOW = Date.parse("2026-09-12T03:00:00.000Z");

function verifiedState(manifest, workerId) {
  const worker = manifest.workers.find((item) => item.id === workerId);
  return {
    workerId,
    status: "live",
    lastHeartbeatAt: "2026-09-12T02:59:59.000Z",
    readiness: worker.capabilities.map((capability) => ({
      workerId,
      capability,
      processStatus: "live",
      providerStatus: "ready",
      canaryStatus: "verified",
      processObservedAt: "2026-09-12T02:59:59.000Z",
      providerObservedAt: "2026-09-12T02:59:58.000Z",
      canaryVerifiedAt: "2026-09-12T02:59:57.000Z",
      lastErrorCode: null,
    })),
  };
}

function descriptor() {
  return createCopilotHarnessDescriptor({
    alias: "enterprise-core",
    harnessType: "github-copilot-harness",
    published: true,
    connectable: true,
    capabilityClasses: ["analysis", "workflow-design"],
    instructionsSummary: "Bounded enterprise reasoning and workflow specialist.",
    knowledgeCategories: ["m365-enterprise", "sharepoint"],
    toolKinds: ["connector", "mcp"],
    skillNames: ["document-analysis"],
    connectedAgentAliases: [],
    modelClass: "reasoning-high",
    modelStatus: "production",
    memoryEnabled: true,
    evaluation: { state: "passing", score: 0.94, observedAt: "2026-09-12T02:50:00.000Z" },
    monitoring: { successRate: 0.98, latencyMs: 1100, observedAt: "2026-09-12T02:55:00.000Z" },
    authorityScopes: ["connector.invoke", "copilot.invoke"],
    dataClasses: ["enterprise"],
    observedAt: "2026-09-12T02:56:00.000Z",
  });
}

test("UCF preserves sanitized Copilot harness model, memory, evaluation, and monitoring evidence", async () => {
  const manifest = await loadManifest();
  const state = verifiedState(manifest, "copilot-studio");
  state.platformAuthorityScopes = ["connector.invoke", "copilot.invoke"];
  state.billingAttestationByCapability = { "studio.delegate": "license-included" };
  const registry = buildCapabilityRegistry(manifest, [state], NOW, { microsoftHarnessDescriptors: [descriptor()] });
  const studio = registry.find((entry) => entry.workerId === "copilot-studio" && entry.capability === "studio.delegate");

  assert.deepEqual(studio.harnessEvidence, [{
    alias: "enterprise-core",
    harnessType: "github-copilot-harness",
    published: true,
    connectable: true,
    capabilityClasses: ["analysis", "workflow-design"],
    modelClass: "reasoning-high",
    modelStatus: "production",
    memoryEnabled: true,
    evaluation: { state: "passing", score: 0.94, observedAt: "2026-09-12T02:50:00.000Z" },
    monitoring: { successRate: 0.98, latencyMs: 1100, observedAt: "2026-09-12T02:55:00.000Z" },
    billingClass: "metered-copilot-credit",
    zeroCreditEligible: false,
    observedAt: "2026-09-12T02:56:00.000Z",
  }]);
});
