/**
 * Fail-closed pull request intake; does not invoke models or change GitHub state.
 * Objective-ID is a versioned, exact match identifier. Do not guess semantic equivalence.
 */
export const DRAFT_LIMIT = 3;
export const OBJECTIVE_REQUIRED_FROM_PR = 1042;

export function objectiveId(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^Objective-ID:\s*([a-z][a-z0-9._-]{3,79})\s*$/im);
  return match?.[1] ?? null;
}

function normalizedTitle(title) {
  return typeof title === "string"
    ? title.toLowerCase().replace(/^\s*(?:\[wip\]|draft:)\s*/i, "")
      .replace(/^(?:feat|fix|chore|test|docs)(?:\([^)]*\))?:\s*/, "")
      .replace(/\s+/g, " ").trim()
    : "";
}

function isCopilot(pr) {
  return /^copilot(?:\[bot\])?$/i.test(pr?.user?.login ?? pr?.author ?? "");
}

export function evaluatePrIntake({ candidate, openPulls, maxDrafts = DRAFT_LIMIT } = {}) {
  if (!candidate || !Array.isArray(openPulls) || !Number.isSafeInteger(candidate.number) || candidate.number < 1)
    return { allowed: false, reason: "pr-intake-evidence-invalid" };
  if (!Number.isSafeInteger(maxDrafts) || maxDrafts < 1)
    return { allowed: false, reason: "draft-cap-invalid" };
  if (openPulls.some(pr => !Number.isSafeInteger(pr?.number) || typeof pr?.draft !== "boolean"))
    return { allowed: false, reason: "pr-intake-list-invalid" };
  const own = openPulls.find(pr => pr.number === candidate.number);
  const draftCount = openPulls.filter(pr => pr.draft).length + (!own && candidate.draft ? 1 : 0);
  if (draftCount > maxDrafts) return { allowed: false, reason: "draft-cap-exceeded", draftCount, maxDrafts };
  const key = objectiveId(candidate.body);
  if (candidate.number >= OBJECTIVE_REQUIRED_FROM_PR && !key)
    return { allowed: false, reason: "objective-id-required", draftCount, maxDrafts };
  // A Copilot PR is never authority evidence for a new implementation lane.
  // External owner-approved Copilot work must be explicitly adopted via an owner-authored PR.
  if (isCopilot(candidate))
    return { allowed: false, reason: "copilot-unapproved-lane", draftCount, maxDrafts };
  const peers = openPulls.filter(pr => pr.number !== candidate.number);
  const duplicates = peers.filter(pr =>
    (key && objectiveId(pr.body) === key)
    || (!key && normalizedTitle(candidate.title) && normalizedTitle(candidate.title) === normalizedTitle(pr.title))
  );
  if (duplicates.length)
    return { allowed: false, reason: "objective-already-open", reusePr: Math.min(...duplicates.map(pr => pr.number)), draftCount, maxDrafts };
  return { allowed: true, reason: "unique-objective", draftCount, maxDrafts, objectiveId: key };
}
