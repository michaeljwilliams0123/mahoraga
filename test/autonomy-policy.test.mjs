import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest, validateManifest } from "../src/config.mjs";
import { autonomyPolicySnapshot, validateAutonomyPolicy } from "../src/autonomy-policy.mjs";

test("Ultron policy makes conversation, debate, integration, and rollback autonomous by default", async () => {
  const manifest = await loadManifest();
  const policy = autonomyPolicySnapshot(manifest);
  assert.deepEqual(policy, {
    baseline: "ultron",
    conversationActivation: true,
    structuredDebate: true,
    automaticIntegration: true,
    maximumImplementationLanes: 2,
    eligibleBranchPrefixes: ["codex/", "destiny/", "feature/", "upgrade/"],
    protectedPaths: [
      ".github/workflows",
      "AGENTS.md",
      "scripts/autonomous-integration.mjs",
      "src/autonomy-policy.mjs",
      "src/autonomous-integration.mjs",
      "src/config.mjs",
      "src/github-audit.mjs",
      "src/update-contract.mjs",
    ],
    requiredVerification: "npm run verify",
    automaticRelease: true,
    canaryRequired: true,
    rollbackRequired: true,
  });
  assert.equal(Object.isFrozen(policy), true);
});

test("Ultron policy rejects weakening recovery or broadening automatic root mutation", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.autonomy.rollbackRequired = false;
  assert.throws(() => validateManifest(manifest), /rollback/i);
  manifest.autonomy.rollbackRequired = true;
  manifest.autonomy.protectedPaths = ["src"];
  assert.throws(() => validateManifest(manifest), /protected path/i);
  assert.throws(() => validateAutonomyPolicy({ ...manifest.autonomy, extra: true }), /field/i);
});
