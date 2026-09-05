import test from "node:test";
import assert from "node:assert/strict";
import { classifyCleanupBranch, classifyLeftoverWave, reduceCleanupLedger } from "../src/branch-cleanup-ledger.mjs";

test("contained Wave A branches with no open PR become delete-eligible only at ahead_by=0", () => {
  const eligible = classifyCleanupBranch({ name: "fix/cloud-cycle-windows-cli-entry-20260905", aheadBy: 0, openPrCount: 0, isProtected: false, wave: "A" });
  assert.equal(eligible.disposition, "delete-eligible");
  assert.equal(eligible.reason, "contained-ahead-zero");

  const unique = classifyCleanupBranch({ name: "feature/chatgpt-grade-ui", aheadBy: 6, openPrCount: 0, wave: "B" });
  assert.equal(unique.disposition, "reconcile");
  assert.equal(unique.reason, "wave-b-divergent");

  const protectedBranch = classifyCleanupBranch({ name: "main", aheadBy: 0, isDefault: true });
  assert.equal(protectedBranch.disposition, "keep");
});

test("open PRs and evidence tags block raw deletion", () => {
  const open = classifyCleanupBranch({ name: "fix/foo", aheadBy: 0, openPrCount: 1 });
  assert.equal(open.reason, "open-pr");
  const evidence = classifyCleanupBranch({
    name: "feature/destiny-trigger-trust-plane-20260903",
    aheadBy: 0,
    openPrCount: 0,
    wave: "A",
    evidenceTag: "archive/contained/feature-destiny-trigger-trust-plane-20260903",
  });
  assert.equal(evidence.disposition, "archive-then-delete");
});

test("ledger counts stay credit-free", () => {
  const ledger = reduceCleanupLedger([
    { name: "main", isDefault: true, aheadBy: 0 },
    { name: "fix/contained", aheadBy: 0, openPrCount: 0, wave: "A" },
    { name: "feature/divergent", aheadBy: 2, openPrCount: 0, wave: "B" },
  ], { evaluatedAt: "2026-09-05T13:40:00.000Z" });
  assert.equal(ledger.counts.keep, 1);
  assert.equal(ledger.counts["delete-eligible"], 1);
  assert.equal(ledger.counts.reconcile, 1);
  assert.equal(ledger.creditCost, 0);
  assert.equal(ledger.paidFallback, false);
});

test("unnamed leftover merged heads default to Wave A except the issue #83 Wave B set", () => {
  assert.equal(classifyLeftoverWave("feature/sovereign-e8ed53929165"), "A");
  assert.equal(classifyLeftoverWave("feature/chatgpt-grade-ui"), "B");
  const leftover = classifyCleanupBranch({ name: "feature/unattended-generation-admit-20260905", aheadBy: 0, openPrCount: 0 });
  assert.equal(leftover.disposition, "delete-eligible");
  const waveB = classifyCleanupBranch({ name: "feature/chatgpt-grade-ui", aheadBy: 0, openPrCount: 0 });
  assert.equal(waveB.disposition, "reconcile");
  assert.equal(waveB.reason, "wave-b-contained-still-reconcile");
});

test("Wave A squash-merged unique SHAs are delete-eligible ghosts, not unrebased work", () => {
  const ghost = classifyCleanupBranch({
    name: "feature/unattended-generation-admit-20260905",
    aheadBy: 412,
    openPrCount: 0,
    wave: "A",
    mergedPullNumber: 156,
    mergeMethod: "squash",
    mergedAt: "2026-09-05T13:30:50Z",
  });
  assert.equal(ghost.disposition, "delete-eligible");
  assert.equal(ghost.reason, "squash-merged-unique-sha-ghost");
  assert.equal(ghost.mergedPullNumber, 156);
  assert.equal(ghost.mergeMethod, "squash");
  assert.equal(ghost.creditCost, 0);
  assert.equal(ghost.paidFallback, false);

  const unique = classifyCleanupBranch({
    name: "feature/unattended-generation-admit-20260905",
    aheadBy: 412,
    openPrCount: 0,
    wave: "A",
  });
  assert.equal(unique.disposition, "reconcile");
  assert.equal(unique.reason, "unique-commits");
});

test("Wave B stays reconcile-only even with squash-merge evidence", () => {
  const waveB = classifyCleanupBranch({
    name: "feature/chatgpt-grade-ui",
    aheadBy: 6,
    openPrCount: 0,
    wave: "B",
    mergedPullNumber: 50,
    mergeMethod: "squash",
    mergedAt: "2026-08-30T22:11:07Z",
  });
  assert.equal(waveB.disposition, "reconcile");
  assert.equal(waveB.reason, "wave-b-divergent");
});

test("squash-merge evidence is fail-closed on invalid fields", () => {
  assert.throws(
    () => classifyCleanupBranch({
      name: "fix/foo",
      aheadBy: 2,
      openPrCount: 0,
      wave: "A",
      mergedPullNumber: 0,
      mergeMethod: "squash",
      mergedAt: "2026-09-05T13:30:50Z",
    }),
    { code: "cleanup-branch-merged-pr-invalid" },
  );
  assert.throws(
    () => classifyCleanupBranch({
      name: "fix/foo",
      aheadBy: 2,
      openPrCount: 0,
      wave: "A",
      mergedPullNumber: 12,
      mergeMethod: "fast-forward",
      mergedAt: "2026-09-05T13:30:50Z",
    }),
    { code: "cleanup-branch-merge-method-invalid" },
  );
});

test("ledger counts squash-merged Wave A leftovers as delete-eligible at $0", () => {
  const ledger = reduceCleanupLedger([
    { name: "main", isDefault: true, aheadBy: 0 },
    {
      name: "feature/unattended-dual-loop-20260905",
      aheadBy: 400,
      openPrCount: 0,
      mergedPullNumber: 139,
      mergeMethod: "squash",
      mergedAt: "2026-09-05T10:27:10Z",
    },
    { name: "feature/chatgpt-grade-ui", aheadBy: 6, openPrCount: 0 },
  ], { evaluatedAt: "2026-09-05T21:00:00.000Z" });
  assert.equal(ledger.counts.keep, 1);
  assert.equal(ledger.counts["delete-eligible"], 1);
  assert.equal(ledger.counts.reconcile, 1);
  assert.equal(ledger.creditCost, 0);
  assert.match(ledger.note, /squash\/merge\/rebase leftover unique SHAs/i);
});
