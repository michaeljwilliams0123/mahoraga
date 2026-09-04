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
  if (pullRequest.changedFiles.some((changedPath) => policy.protectedPaths.some((protectedPath) => pathIsProtected(changedPath, protectedPath)))) return reject("protected-path");
  if (pullRequest.headRef.startsWith("destiny/")) {
    if (pullRequest.destinyRelayVerified !== true) return reject("destiny-relay-verification-required");
    if (!pullRequest.changedFiles.some((changedPath) => !pathIsProtected(changedPath, DESTINY_DISPATCH_DIRECTORY))) return reject("destiny-implementation-required");
  }
  return Object.freeze({
    eligible: true,
    reason: "eligible",
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
