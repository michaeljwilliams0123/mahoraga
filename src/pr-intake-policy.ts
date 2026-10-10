/**
 * Fail-closed pull request intake; does not invoke models or change GitHub state.
 * Objective-ID is a versioned, exact match identifier. Do not guess semantic equivalence.
 */
export type PullRequest = {
  number: number; draft: boolean; state?: string; title?: string | null; body?: string | null;
  user?: { login?: string }; author?: string;
};
export type IntakeDecision = {
  allowed: boolean; reason: string; reusePr?: number; draftCount?: number; maxDrafts?: number; objectiveId?: string | null;
};
export const DRAFT_LIMIT = 3;
export const OBJECTIVE_REQUIRED_FROM_PR = 1042;

export function objectiveId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // A single unambiguous lowercase objective is required. Never accept the
  // first valid marker if a second conflicting or malformed marker follows.
  const declarations = value.split(/\r?\n/).filter((line) => /^Objective-ID:/i.test(line));
  const declaration = declarations[0];
  if (declarations.length !== 1 || declaration === undefined) return null;
  const match = declaration.replace(/^Objective-ID:/i, "").match(/^[ \t]*([a-z][a-z0-9._-]{3,79})[ \t]*$/);
  return match?.[1] ?? null;
}

function normalizedTitle(title: unknown): string {
  return typeof title === "string"
    ? title.toLowerCase().replace(/^\s*(?:\[wip\]|draft:)\s*/i, "")
      .replace(/^(?:feat|fix|chore|test|docs)(?:\([^)]*\))?:\s*/, "")
      .replace(/\s+/g, " ").trim()
    : "";
}

function isCopilot(pr: PullRequest): boolean {
  return /^copilot(?:\[bot\])?$/i.test(pr?.user?.login ?? pr?.author ?? "");
}

export function evaluatePrIntake(
  { candidate, openPulls, maxDrafts = DRAFT_LIMIT }: {
    candidate?: PullRequest; openPulls?: PullRequest[]; maxDrafts?: number
  } = {},
): IntakeDecision {
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
