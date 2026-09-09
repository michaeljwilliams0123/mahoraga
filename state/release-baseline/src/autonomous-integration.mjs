import { validateSovereignEvolutionReceipt } from "./sovereign-evolution.mjs";

const TRUSTED_REPOSITORY = "michaeljwilliams0123/mahoraga";
const TRUSTED_WORKFLOW = "Verify Mahoraga";
const DESTINY_RESULT_MARKER = "[DESTINY-CODEX:RESULT]";
const DESTINY_DISPATCH_DIRECTORY = "coordination/destiny-dispatches";
const ALLOWED_WORKFLOW_EVENTS = new Set(["pull_request", "workflow_dispatch"]);
const ALLOWED_IGNORED_CONCLUSIONS = new Set(["action_required"]);

function reject(reason) {
  return Object.freeze({ eligible: false, reason });
}

function pathIsProtected(changedPath, protectedPath) {
  return changedPath === protectedPath || changedPath.startsWith(`${protectedPath}/`);
}

export function evaluateAutonomousIntegration(input, policy) {
  const workflow = input?.workflow;
  const pullRequest = input?.pullRequest;
  if (policy?.automaticIntegration !== true) return reject("automatic-integration-disabled");
  if (!workflow || !pullRequest) return reject("candidate-incomplete");
  if (workflow.name !== TRUSTED_WORKFLOW || workflow.conclusion !== "success") return reject("verification-not-successful");
  if (pullRequest.state !== "open") return reject("pull-request-not-open");
  if (pullRequest.draft === true) return reject("draft-not-eligible");
  if (pullRequest.baseRepository !== TRUSTED_REPOSITORY || pullRequest.headRepository !== pullRequest.baseRepository) return reject("fork-not-eligible");
  if (pullRequest.baseRef !== "main") return reject("base-not-eligible");
  if (workflow.headSha !== pullRequest.headSha) return reject("verified-head-mismatch");
  if (pullRequest.baseSha !== pullRequest.currentMainSha) return reject("base-advanced");
  if (pullRequest.headContainsMain !== true) return reject("head-behind-main");
  if (pullRequest.mergeable !== true) return reject("merge-conflict");
  if (!Array.isArray(policy.eligibleBranchPrefixes) || !policy.eligibleBranchPrefixes.some((prefix) => pullRequest.headRef?.startsWith(prefix))) return reject("branch-not-eligible");
  if (!Array.isArray(pullRequest.changedFiles) || pullRequest.changedFiles.length < 1 || pullRequest.changedFiles.length > 256) return reject("changed-files-invalid");

  const protectedChange = pullRequest.changedFiles.some((changedPath) => policy.protectedPaths.some((protectedPath) => pathIsProtected(changedPath, protectedPath)));
  let sovereignEligible = false;
  if (protectedChange) {
    if (!pullRequest.sovereignEvolution || !pullRequest.trustedEpoch) return reject("protected-path");
    const sovereign = validateSovereignEvolutionReceipt(pullRequest.sovereignEvolution, {
      headSha: pullRequest.headSha,
      trustedEpoch: pullRequest.trustedEpoch,
    });
    if (!sovereign.valid) return reject(sovereign.reason);
    sovereignEligible = true;
  }

  if (pullRequest.headRef.startsWith("destiny/")) {
    if (pullRequest.destinyRelayVerified !== true) return reject("destiny-relay-verification-required");
    if (!pullRequest.changedFiles.some((changedPath) => !pathIsProtected(changedPath, DESTINY_DISPATCH_DIRECTORY))) return reject("destiny-implementation-required");
  }
  return Object.freeze({
    eligible: true,
    reason: sovereignEligible ? "sovereign-eligible" : "eligible",
    pullRequestNumber: pullRequest.number,
    headSha: pullRequest.headSha,
  });
}

export function latestExactWorkflowRun(
  runs,
  { name, headSha, events = ["pull_request"], ignoredConclusions = [] } = {},
) {
  if (!Array.isArray(runs) || typeof name !== "string" || !/^[a-f0-9]{40}$/.test(headSha ?? "")) return null;
  if (!Array.isArray(events) || events.length === 0 || events.some((event) => !ALLOWED_WORKFLOW_EVENTS.has(event))) return null;
  if (!Array.isArray(ignoredConclusions) || ignoredConclusions.some((value) => !ALLOWED_IGNORED_CONCLUSIONS.has(value))) return null;
  const eventSet = new Set(events);
  const ignoredSet = new Set(ignoredConclusions);
  return [...runs]
    .filter((run) => run?.name === name && run?.head_sha === headSha && eventSet.has(run?.event) && !ignoredSet.has(run?.conclusion))
    .sort(newestFirst)[0] ?? null;
}


export const REQUIRED_MERGE_CHECK_CONTEXTS = Object.freeze([
  "Verify (ubuntu-latest)",
  "Verify (windows-latest)",
]);

export function classifyPullMergeState(mergeableState) {
  const state = String(mergeableState ?? "").trim().toLowerCase();
  if (state === "clean" || state === "has_hooks") {
    return Object.freeze({ ok: true, status: "ready", reason: "merge-state-clean" });
  }
  if (state === "behind") return Object.freeze({ ok: false, status: "blocked", reason: "head-behind-main" });
  if (state === "dirty") return Object.freeze({ ok: false, status: "blocked", reason: "merge-conflict" });
  if (state === "draft") return Object.freeze({ ok: false, status: "blocked", reason: "draft-not-eligible" });
  if (state === "unstable") return Object.freeze({ ok: false, status: "blocked", reason: "required-checks-failing" });
  if (state === "blocked" || state === "unknown" || state === "") {
    return Object.freeze({ ok: false, status: "hold", reason: "required-checks-pending" });
  }
  return Object.freeze({ ok: false, status: "hold", reason: "merge-state-unknown" });
}

export function requiredExactHeadChecksReady(checkRuns, {
  headSha,
  requiredContexts = REQUIRED_MERGE_CHECK_CONTEXTS,
} = {}) {
  const runs = normalizeCheckRuns(checkRuns);
  if (!/^[a-f0-9]{40}$/.test(headSha ?? "") || !Array.isArray(requiredContexts) || requiredContexts.length < 1) {
    return Object.freeze({ ok: false, reason: "required-checks-invalid", missing: Object.freeze([...requiredContexts ?? []]) });
  }
  const missing = [];
  for (const context of requiredContexts) {
    const latest = runs
      .filter((run) => run?.name === context && (run.head_sha === headSha || run.headSha === headSha))
      .sort(newestCheckFirst)[0];
    if (!latest || latest.status !== "completed" || latest.conclusion !== "success") missing.push(context);
  }
  if (missing.length > 0) {
    return Object.freeze({ ok: false, reason: "required-checks-pending", missing: Object.freeze(missing) });
  }
  return Object.freeze({ ok: true, reason: "required-checks-ready", missing: Object.freeze([]) });
}

export function evaluateExactHeadMergeGate({
  policyDecision,
  mergeableState,
  checkRuns = [],
  headSha,
  requiredContexts = REQUIRED_MERGE_CHECK_CONTEXTS,
} = {}) {
  if (!policyDecision?.eligible) {
    return Object.freeze({
      ok: false,
      status: "blocked",
      reason: policyDecision?.reason ?? "ineligible",
      missing: Object.freeze([]),
      creditCost: 0,
      paidFallback: false,
    });
  }
  const state = classifyPullMergeState(mergeableState);
  if (state.status === "ready") {
    return Object.freeze({
      ok: true,
      status: "ready",
      reason: "required-checks-ready",
      missing: Object.freeze([]),
      creditCost: 0,
      paidFallback: false,
    });
  }
  if (state.status === "blocked") {
    return Object.freeze({
      ok: false,
      status: "blocked",
      reason: state.reason,
      missing: Object.freeze([]),
      creditCost: 0,
      paidFallback: false,
    });
  }
  const checks = requiredExactHeadChecksReady(checkRuns, { headSha, requiredContexts });
  return Object.freeze({
    ok: false,
    status: "hold",
    reason: checks.ok ? "required-checks-not-yet-on-pull-request" : checks.reason,
    missing: checks.missing,
    creditCost: 0,
    paidFallback: false,
  });
}

export function classifyMergeRuleViolation(error) {
  const status = Number(error?.status ?? error?.response?.status ?? 0);
  const message = String(error?.message ?? error?.response?.data?.message ?? "");
  if (status === 405 && /required status checks are expected/i.test(message)) {
    return Object.freeze({ status: "hold", reason: "required-checks-pending", creditCost: 0, paidFallback: false });
  }
  if (status === 405 && /required status checks/i.test(message)) {
    return Object.freeze({ status: "hold", reason: "required-checks-pending", creditCost: 0, paidFallback: false });
  }
  if (status === 409 || /head branch was modified|sha was invalid/i.test(message)) {
    return Object.freeze({ status: "blocked", reason: "verified-head-advanced", creditCost: 0, paidFallback: false });
  }
  return Object.freeze({ status: "blocked", reason: "merge-rejected", creditCost: 0, paidFallback: false });
}

function normalizeCheckRuns(checkRuns) {
  if (Array.isArray(checkRuns)) return checkRuns;
  if (Array.isArray(checkRuns?.check_runs)) return checkRuns.check_runs;
  return [];
}

function newestCheckFirst(left, right) {
  const completed = Date.parse(right.completed_at ?? "") - Date.parse(left.completed_at ?? "");
  if (Number.isFinite(completed) && completed !== 0) return completed;
  return numeric(right.id) - numeric(left.id);
}

export function latestExactDestinyResult(comments, { owner, headSha } = {}) {
  if (!Array.isArray(comments) || typeof owner !== "string" || !/^[a-f0-9]{40}$/.test(headSha ?? "")) return null;
  const latest = comments
    .map((comment) => parseDestinyResult(comment, owner))
    .filter((result) => result?.headSha === headSha)
    .sort(newestFirst)[0];
  return latest ? Object.freeze({ status: latest.status, headSha: latest.headSha }) : null;
}

function parseDestinyResult(comment, owner) {
  if (comment?.user?.login !== owner || typeof comment.body !== "string") return null;
  const lines = comment.body.split(/\r?\n/);
  if (lines[0] !== DESTINY_RESULT_MARKER) return null;
  const status = uniqueField(lines, "status");
  const headSha = uniqueField(lines, "head");
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(status ?? "") || !/^[a-f0-9]{40}$/.test(headSha ?? "")) return null;
  return { status, headSha, id: comment.id, created_at: comment.created_at };
}

function uniqueField(lines, key) {
  const prefix = `${key}=`;
  const values = lines.filter((line) => line.startsWith(prefix)).map((line) => line.slice(prefix.length).replace(/^`|`$/g, ""));
  return values.length === 1 ? values[0] : null;
}

function newestFirst(left, right) {
  const runNumber = numeric(right.run_number) - numeric(left.run_number);
  if (runNumber !== 0) return runNumber;
  const attempt = numeric(right.run_attempt) - numeric(left.run_attempt);
  if (attempt !== 0) return attempt;
  const timestamp = Date.parse(right.created_at ?? "") - Date.parse(left.created_at ?? "");
  if (Number.isFinite(timestamp) && timestamp !== 0) return timestamp;
  return numeric(right.id) - numeric(left.id);
}

function numeric(value) {
  return Number.isSafeInteger(Number(value)) ? Number(value) : 0;
}
