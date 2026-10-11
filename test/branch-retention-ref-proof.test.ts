import test from "node:test";
import assert from "node:assert/strict";
// @ts-ignore Existing migration-debt module remains the canonical cleanup classifier.
import { classifyCleanupBranch } from "../src/branch-cleanup-ledger.mjs";

const ghost = {
  name: "copilot/fix-example",
  aheadBy: 1,
  openPrCount: 0,
  netChangedPathCount: 0,
  refVerified: true,
  prHistoryComplete: true,
  activeRefCount: 0,
  isProtected: false,
};

test("empty-change branch requires independent current-ref and PR-history evidence before cleanup", () => {
  const ready = classifyCleanupBranch(ghost);
  assert.equal(ready.disposition, "archive-then-delete");
  assert.equal(ready.reason, "empty-change-verified");
  for (const missing of [
    { refVerified: false },
    { prHistoryComplete: false },
    { netChangedPathCount: undefined },
  ]) {
    const result = classifyCleanupBranch({ ...ghost, ...missing });
    assert.equal(result.disposition, "reconcile");
  }
});

test("live workflow reference prevents deletion for contained, squash-merged, and empty branches", () => {
  for (const branch of [
    { name: "fix/stale-but-referenced", aheadBy: 0 },
    { ...ghost },
    { name: "fix/squash-merged-referenced", aheadBy: 1,
      mergedPullNumber: 42, mergeMethod: "squash", mergedAt: "2026-10-10T10:00:00Z" },
  ]) {
    const result = classifyCleanupBranch({ ...branch, activeRefCount: 1 });
    assert.equal(result.disposition, "reconcile");
    assert.equal(result.reason, "live-reference-in-current-main");
  }
});

test("protected, open-PR, and Wave B branches remain preserved", () => {
  assert.equal(classifyCleanupBranch({ ...ghost, isProtected: true }).disposition, "keep");
  assert.equal(classifyCleanupBranch({ ...ghost, openPrCount: 1 }).disposition, "keep");
  assert.equal(classifyCleanupBranch({ ...ghost, wave: "B" }).disposition, "reconcile");
});

test("invalid reference and tree proof counts fail closed", () => {
  for (const changes of [
    { activeRefCount: -1 },
    { netChangedPathCount: -1 },
    { activeRefCount: 1.5 },
  ]) {
    assert.throws(() => classifyCleanupBranch({ ...ghost, ...changes }));
  }
});
