import test from "node:test";
import assert from "node:assert/strict";

const evolutionModule = await import("../src/self-evolution-worker.mjs").catch(() => null);

const worker = { id: "primary-codex-builder", adapter: { kind: "codex-cli-builder" } };
const baseCommit = "a".repeat(40);
const headCommit = "b".repeat(40);
const changedPaths = ["src/example.mjs", "test/example.test.mjs"];

function task(overrides = {}) {
  return {
    id: "task-self-evolution-1",
    correlationId: "corr-self-evolution-1",
    requestedOutcome: "Improve the bounded implementation.",
    evolutionCapability: "self.enhance",
    baseCommit,
    allowedPaths: [...changedPaths],
    integrationLeaseId: "int-00000000-0000-0000-0000-000000000000",
    integrationLease: { leaseId: "int-00000000-0000-0000-0000-000000000000", paths: [...changedPaths], expiresAt: "2099-01-01T00:00:00.000Z" },
    ...overrides,
  };
}
function containedCandidate(overrides = {}) {
  return {
    verified: true,
    summary: "contained candidate",
    providerReceipt: {
      executionMode: "candidate-worktree",
      cellId: `cell-${"c".repeat(20)}`,
      executionSessionId: "builder-task-self-evolution-1",
      sandbox: "workspace-write",
      approvalPolicy: "never",
      networkAccess: false,
      ephemeral: true,
      baseCommit,
      headCommit,
      branch: "mahoraga/task-self-evolution-1",
      worktreeIdentitySha256: "d".repeat(64),
      allowedPaths: [...changedPaths],
      changedPaths: [...changedPaths],
      validationState: "passed",
      quarantineState: "clear",
      failureCode: null,
      threadId: null,
      outputSha256: "e".repeat(64),
      usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningOutputTokens: 0 },
      finalResponseStored: false,
    },
    ...overrides,
  };
}
test("self.evolve publishes only the exact verified contained candidate", async () => {
  assert.ok(evolutionModule, "self evolution worker module should exist");
  assert.equal(typeof evolutionModule.executeSelfEvolutionCapability, "function");
  let extensionCall;
  let publicationCall;
  const result = await evolutionModule.executeSelfEvolutionCapability("self.evolve", task(), worker, {
    executeSelfExtension: async (...args) => {
      extensionCall = args;
      return containedCandidate();
    },
    publishCandidate: async (input) => {
      publicationCall = input;
      return {
        baseSha: input.baseSha,
        headSha: input.headSha,
        branch: input.branchName,
        pullRequestNumber: 301,
        changedFilesDigest: "f".repeat(64),
      };
    },
  });
  assert.equal(extensionCall[0], "self.enhance");
  assert.equal(extensionCall[1].baseCommit, baseCommit);
  assert.deepEqual(publicationCall.changedFiles, changedPaths);
  assert.equal(publicationCall.baseSha, baseCommit);
  assert.equal(publicationCall.headSha, headCommit);
  assert.match(publicationCall.branchName, /^feature\/sovereign-evolution-/);
  assert.equal(result.verified, true);
  assert.equal(result.providerReceipt.validationState, "passed");
  assert.deepEqual(result.selfEvolution, {
    schemaVersion: 1,
    evolutionCapability: "self.enhance",
    baseSha: baseCommit,
    headSha: headCommit,
    branch: publicationCall.branchName,
    pullRequestNumber: 301,
    changedFilesDigest: "f".repeat(64),
  });
  assert.doesNotMatch(JSON.stringify(result.selfEvolution), /Improve the bounded implementation|prompt|response/i);
});
test("self.evolve never publishes an unverified or quarantined candidate", async () => {
  assert.ok(evolutionModule);
  for (const candidate of [
    containedCandidate({ verified: false }),
    containedCandidate({ providerReceipt: { ...containedCandidate().providerReceipt, quarantineState: "quarantined", validationState: "failed" } }),
  ]) {
    let published = false;
    await assert.rejects(
      evolutionModule.executeSelfEvolutionCapability("self.evolve", task(), worker, {
        executeSelfExtension: async () => candidate,
        publishCandidate: async () => { published = true; return {}; },
      }),
      (error) => error?.code === "self-evolution-candidate-unverified",
    );
    assert.equal(published, false);
  }
});

test("self.evolve refuses unsupported self-extension lanes", async () => {
  assert.ok(evolutionModule);
  await assert.rejects(
    evolutionModule.executeSelfEvolutionCapability("self.evolve", task({ evolutionCapability: "agent.replicate" }), worker, {}),
    (error) => error?.code === "self-evolution-capability-invalid",
  );
});
const { createCapabilityReceipt } = await import("../src/receipt-registry.mjs");

test("self.evolve uses the strict Codex containment receipt family", () => {
  const result = containedCandidate({
    selfEvolution: {
      schemaVersion: 1,
      evolutionCapability: "self.enhance",
      baseSha: baseCommit,
      headSha: headCommit,
      branch: "feature/sovereign-evolution-abcdef1234567890abcdef12",
      pullRequestNumber: 301,
      changedFilesDigest: "f".repeat(64),
    },
  });
  const receipt = createCapabilityReceipt("self.evolve", result, { observedAt: "2026-09-08T20:00:00.000Z", durationMs: 12 });
  assert.equal(receipt.details.family, "codex");
  assert.equal(receipt.outcome, "succeeded");
  assert.equal(receipt.details.providerEvidence.validationState, "passed");
  assert.equal(receipt.details.providerEvidence.networkAccess, false);
});
test("owner self.evolve defaults to enhance and selects patch for explicit fixes", async () => {
  const observed = [];
  const dependencies = {
    executeSelfExtension: async (capability) => { observed.push(capability); return containedCandidate(); },
    publishCandidate: async (input) => ({
      baseSha: input.baseSha, headSha: input.headSha, branch: input.branchName,
      pullRequestNumber: 302, changedFilesDigest: "f".repeat(64),
    }),
  };
  await evolutionModule.executeSelfEvolutionCapability("self.evolve", task({ evolutionCapability: undefined }), worker, dependencies);
  await evolutionModule.executeSelfEvolutionCapability("self.evolve", task({
    evolutionCapability: undefined,
    requestedOutcome: "Fix the owner command routing defect.",
  }), worker, dependencies);
  assert.deepEqual(observed, ["self.enhance", "self.patch"]);
});