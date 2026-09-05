const DEFAULT_BRANCH = "main";

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
  const wave = branch.wave === "B" ? "B" : "A";
  if (wave === "B") {
    return frozen({
      name,
      disposition: "reconcile",
      reason: aheadBy === 0 ? "wave-b-contained-still-reconcile" : "wave-b-divergent",
      aheadBy,
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
    note: "Deletion requires a fresh main comparison immediately before the ref is removed. Ahead_by must be 0.",
  });
}
