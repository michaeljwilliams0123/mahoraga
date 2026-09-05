const DEFAULT_BRANCH = "main";
const MERGE_METHODS = Object.freeze(["squash", "merge", "rebase"]);

export const WAVE_B_BRANCHES = Object.freeze([
  "agent/target-state-capability-router",
  "alert-autofix-37",
  "alert-autofix-52",
  "codex/repair-destiny-dispatch-69",
  "destiny/live-connection-probe-20260829",
  "destiny/public-next-ui-20260830",
  "destiny/ultron-ui-20260830",
  "feature/chatgpt-grade-ui",
  "feature/first-valid-fix-automerge",
  "feature/github-realtime-destiny-trigger-20260826",
  "feature/mahoraga-4-foundation-20260824",
  "primary-cloud/dual-primary-controller-20260824",
  "secondary/sec-ae4135e2-a201-4467-b59e-8d16ed9e784a",
  "upgrade/conversation-workspace-wave2-20260830",
  "upgrade/desktop-provider-contract-20260823",
  "upgrade/destiny-result-gate-20260830",
  "upgrade/execution-plane-wave1-20260830",
  "upgrade/gap-closure-wave-1-20260823",
  "upgrade/microsoft-queue-readiness-20260823",
  "upgrade/ultron-autonomy-baseline-20260830",
]);

function frozen(value) {
  return Object.freeze(value);
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

function requireObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function readMergedPullEvidence(branch) {
  const mergedPullNumber = branch.mergedPullNumber;
  if (mergedPullNumber === undefined || mergedPullNumber === null) return null;
  if (!Number.isSafeInteger(mergedPullNumber) || mergedPullNumber < 1) fail("cleanup-branch-merged-pr-invalid");
  const mergeMethod = branch.mergeMethod;
  if (!MERGE_METHODS.includes(mergeMethod)) fail("cleanup-branch-merge-method-invalid");
  const mergedAt = branch.mergedAt;
  if (typeof mergedAt !== "string" || mergedAt.length < 10) fail("cleanup-branch-merged-at-invalid");
  return frozen({ mergedPullNumber, mergeMethod, mergedAt });
}

export function classifyLeftoverWave(name) {
  if (typeof name !== "string" || name.length < 1) fail("cleanup-branch-name-invalid");
  return WAVE_B_BRANCHES.includes(name) ? "B" : "A";
}

export function classifyCleanupBranch(input = {}) {
  const branch = requireObject(input, "cleanup-branch-invalid");
  const name = branch.name;
  if (typeof name !== "string" || name.length < 1 || name.length > 255) fail("cleanup-branch-name-invalid");
  if (name === DEFAULT_BRANCH || branch.isDefault === true) {
    return frozen({ name, disposition: "keep", reason: "protected-or-default", creditCost: 0, paidFallback: false });
  }
  if (branch.isProtected === true) {
    return frozen({ name, disposition: "keep", reason: "protected-or-default", creditCost: 0, paidFallback: false });
  }
  const openPrCount = branch.openPrCount ?? 0;
  if (!Number.isSafeInteger(openPrCount) || openPrCount < 0) fail("cleanup-branch-open-pr-invalid");
  if (openPrCount > 0) {
    return frozen({ name, disposition: "keep", reason: "open-pr", creditCost: 0, paidFallback: false });
  }
  const aheadBy = branch.aheadBy;
  if (!Number.isSafeInteger(aheadBy) || aheadBy < 0) fail("cleanup-branch-ahead-invalid");
  const wave = branch.wave === "A" || branch.wave === "B" ? branch.wave : classifyLeftoverWave(name);
  const merged = readMergedPullEvidence(branch);
  if (wave === "B") {
    return frozen({
      name,
      disposition: "reconcile",
      reason: aheadBy === 0 ? "wave-b-contained-still-reconcile" : "wave-b-divergent",
      aheadBy,
      mergedPullNumber: merged?.mergedPullNumber ?? null,
      creditCost: 0,
      paidFallback: false,
    });
  }
  if (aheadBy === 0) {
    return frozen({
      name,
      disposition: branch.evidenceTag ? "archive-then-delete" : "delete-eligible",
      reason: branch.evidenceTag ? "contained-evidence-archive" : "contained-ahead-zero",
      aheadBy: 0,
      evidenceTag: branch.evidenceTag ?? null,
      creditCost: 0,
      paidFallback: false,
    });
  }
  if (merged) {
    return frozen({
      name,
      disposition: branch.evidenceTag ? "archive-then-delete" : "delete-eligible",
      reason: branch.evidenceTag ? "squash-merged-evidence-archive" : "squash-merged-unique-sha-ghost",
      aheadBy,
      mergedPullNumber: merged.mergedPullNumber,
      mergeMethod: merged.mergeMethod,
      mergedAt: merged.mergedAt,
      evidenceTag: branch.evidenceTag ?? null,
      creditCost: 0,
      paidFallback: false,
      note: "Squash/merge unique SHAs are leftover objects after GitHub rewrote the commit on main. They are not unrebased work. Deletion still requires a fresh comparison immediately before the ref is removed.",
    });
  }
  return frozen({
    name,
    disposition: "reconcile",
    reason: "unique-commits",
    aheadBy,
    creditCost: 0,
    paidFallback: false,
  });
}

export function reduceCleanupLedger(branches = [], { evaluatedAt = new Date().toISOString() } = {}) {
  if (!Array.isArray(branches)) fail("cleanup-branches-invalid");
  const records = branches.map((branch) => classifyCleanupBranch(branch));
  const counts = {
    keep: 0,
    "delete-eligible": 0,
    "archive-then-delete": 0,
    reconcile: 0,
  };
  for (const record of records) counts[record.disposition] += 1;
  return frozen({
    schemaVersion: 1,
    kind: "branch-cleanup-ledger",
    evaluatedAt,
    comparedAgainst: DEFAULT_BRANCH,
    counts: frozen(counts),
    records: frozen(records),
    creditCost: 0,
    paidFallback: false,
    note: "Deletion requires a fresh main comparison immediately before the ref is removed. Wave A is delete-eligible at ahead_by=0 or when a merged PR attests squash/merge/rebase leftover unique SHAs. Wave B stays reconcile-only. Buying storage is not a recovery path.",
  });
}
