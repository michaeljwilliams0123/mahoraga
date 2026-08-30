const TRUSTED_REPOSITORY = "michaeljwilliams0123/mahoraga";
const TRUSTED_WORKFLOW = "Verify Mahoraga";

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
  return Object.freeze({
    eligible: true,
    reason: "eligible",
    pullRequestNumber: pullRequest.number,
    headSha: pullRequest.headSha,
  });
}
