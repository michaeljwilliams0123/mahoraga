import test from "node:test";
import assert from "node:assert/strict";
import { projectCandidateReceipt } from "../scripts/sovereign-candidate-receipt.mjs";

test("persisted candidate receipt is exact, content-free, and zero-cost", () => {
  const cycle = {
    status: "candidate-ready",
    cycleId: "a".repeat(64),
    windowStartUtc: "2026-10-16T17:24:02.000Z",
    candidate: {
      baseSha: "b".repeat(40),
      headSha: "c".repeat(40),
      branch: "feature/sovereign-acceptance",
      pullRequestNumber: 1136,
      changedFilesDigest: "d".repeat(64),
    },
    hiddenPayload: "never publish",
  };
  const receipt = projectCandidateReceipt(cycle);
  assert.equal(receipt.cycleId, cycle.cycleId);
  assert.equal(receipt.headSha, cycle.candidate.headSha);
  assert.equal(receipt.pullRequestNumber, 1136);
  assert.equal(receipt.creditCost, 0);
  assert.equal(receipt.paidFallback, false);
  assert.doesNotMatch(JSON.stringify(receipt), /never publish/);
  assert.equal(projectCandidateReceipt({ status: "no-candidate" }), null);
  assert.throws(() => projectCandidateReceipt({
    ...cycle, candidate: { ...cycle.candidate, headSha: cycle.candidate.baseSha },
  }), /candidate head must differ/);
});
